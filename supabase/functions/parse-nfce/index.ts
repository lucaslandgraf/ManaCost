import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParsedItem {
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { raw_data, user_id, event_id } = await req.json();

    if (!raw_data || !user_id) {
      return new Response(
        JSON.stringify({ error: "raw_data e user_id são obrigatórios." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Extrair chave de 44 dígitos ou a URL completa
    let accessKey = "";
    const keyMatch = raw_data.match(/[0-9]{44}/);
    if (keyMatch) {
      accessKey = keyMatch[0];
    } else {
      const pMatch = raw_data.match(/[?&]p=([0-9]{44})/i);
      if (pMatch) accessKey = pMatch[1];
    }

    console.log("Processando leitura. Chave detetada:", accessKey);

    if (!accessKey || accessKey.length !== 44) {
      return new Response(
        JSON.stringify({ error: "Chave de acesso de 44 dígitos não identificada." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 2. Verificação de existência prévia
    const { data: existingPurchase } = await supabaseAdmin
      .from("purchases")
      .select("id, store_name, total_amount, purchase_date")
      .eq("access_key", accessKey)
      .maybeSingle();

    // Caso A: Se for chamada a partir de um Evento/Viagem, reaproveita os dados direto
    if (existingPurchase && event_id) {
      console.log("Nota já existente. Reutilizando para o evento:", event_id);
      return new Response(
        JSON.stringify({
          success: true,
          store_name: existingPurchase.store_name,
          total_amount: Number(existingPurchase.total_amount).toFixed(2),
          reused: true,
          access_key: accessKey,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Caso B: Se for leitura normal da tela inicial e a nota já existe em `purchases`
    if (existingPurchase && !event_id) {
      // 1. Busca transação ativa recente associada a esta compra
      const { data: activeTxList } = await supabaseAdmin
        .from("transactions")
        .select("id")
        .eq("user_id", user_id)
        .eq("amount", existingPurchase.total_amount)
        .ilike("description", `%${existingPurchase.store_name}%`)
        .limit(1);

      const activeTx = activeTxList && activeTxList.length > 0 ? activeTxList[0] : null;

      // Se a transação já está visível na tela inicial, avisa para evitar duplicar
      if (activeTx) {
        return new Response(
          JSON.stringify({
            already_registered: true,
            message: "Esta nota fiscal já consta nos seus lançamentos.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Se não existe na tela, busca categoria
      const { data: category } = await supabaseAdmin
        .from("categories")
        .select("id")
        .eq("user_id", user_id)
        .ilike("name", "%Supermercado%")
        .limit(1)
        .maybeSingle();

      // Recria a transação diretamente
      const { error: insertTxError } = await supabaseAdmin.from("transactions").insert({
        user_id,
        category_id: category?.id || null,
        description: `NFC-e: ${existingPurchase.store_name}`,
        amount: existingPurchase.total_amount,
        type: "expense",
        date: existingPurchase.purchase_date || new Date().toISOString().split("T")[0],
        is_settled: true,
        purchase_id: existingPurchase.id,
      });

      if (insertTxError) {
        console.error("Erro ao recriar transação:", insertTxError.message);
        return new Response(
          JSON.stringify({ error: `Falha ao recriar transação: ${insertTxError.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          store_name: existingPurchase.store_name,
          total_amount: Number(existingPurchase.total_amount).toFixed(2),
          recreated: true,
          access_key: accessKey,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Consulta à SEFAZ (apenas se for a primeira vez que o sistema processa a nota)
    const targetUrl = raw_data.startsWith("http")
      ? raw_data
      : `http://www.fazenda.pr.gov.br/nfce/qrcode?p=${accessKey}`;

    let storeName = "Supermercado / Estabelecimento";
    let totalAmount = 0;
    const items: ParsedItem[] = [];

    try {
      const resp = await fetch(targetUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        redirect: "follow",
      });

      const html = await resp.text();

      // Extração do Nome do Estabelecimento
      const storeMatch =
        html.match(/<div[^>]*class="[^"]*txtTopo[^"]*"[^>]*>([^<]+)<\/div>/i) ||
        html.match(/<span[^>]*class="[^"]*txtTit[^"]*"[^>]*>([^<]+)<\/span>/i) ||
        html.match(/<div[^>]*id="u20"[^>]*>([^<]+)<\/div>/i);

      if (storeMatch) {
        storeName = storeMatch[1].trim();
      }

      // 1. Extração do "Valor a pagar" (valor líquido real final)
      const payMatch =
        html.match(/Valor\s*a\s*pagar.*?class="[^"]*totalNumb[^"]*"[^>]*>([\d,.]+)/is) ||
        html.match(/class="[^"]*totalNumb\s+txtMax[^"]*"[^>]*>([\d,.]+)<\/span>/i) ||
        html.match(/Valor\s*Total.*?class="[^"]*totalNumb[^"]*"[^>]*>([\d,.]+)/is);

      if (payMatch) {
        totalAmount = parseFloat(payMatch[1].replace(/\./g, "").replace(",", ".").trim());
      }

      // 2. Extração de Descontos (caso conste na nota)
      const discountMatch = html.match(/Descontos?.*?class="[^"]*totalNumb[^"]*"[^>]*>([\d,.]+)/is);
      const discountVal = discountMatch
        ? parseFloat(discountMatch[1].replace(/\./g, "").replace(",", ".").trim())
        : 0;

      // 3. Extração dos Itens
      const rows = html.match(/<tr[^>]*id="Item \+ \d+"[\s\S]*?<\/tr>/gi) ||
                   html.match(/<tr[^>]*class="[^"]*linhaItem[^"]*"[\s\S]*?<\/tr>/gi);

      if (rows && rows.length > 0) {
        for (const row of rows) {
          const nameMatch = row.match(/<span[^>]*class="[^"]*txtTit2[^"]*"[^>]*>([^<]+)<\/span>/i);
          const qtyMatch = row.match(/Qtde\.:?<\/strong>\s*([\d,.]+)/i) || row.match(/(\d+[,\.]\d+)\s*UN/i);
          const unitMatch = row.match(/Vl\.\s*Unit\.:?<\/strong>\s*([\d,.]+)/i);
          const totMatch = row.match(/<span[^>]*class="[^"]*valor[^"]*"[^>]*>([\d,.]+)<\/span>/i);

          if (nameMatch) {
            const qty = qtyMatch ? parseFloat(qtyMatch[1].replace(",", ".")) : 1;
            const unit = unitMatch ? parseFloat(unitMatch[1].replace(",", ".")) : 0;
            const tot = totMatch ? parseFloat(totMatch[1].replace(/\./g, "").replace(",", ".")) : qty * unit;

            items.push({
              name: nameMatch[1].trim(),
              quantity: isNaN(qty) ? 1 : qty,
              unit_price: isNaN(unit) ? 0 : unit,
              total_price: isNaN(tot) ? 0 : tot,
            });
          }
        }
      }

      // 4. Fallback de segurança: só soma itens se a leitura do "Valor a pagar" estiver vazia ou zerada
      if (isNaN(totalAmount) || totalAmount <= 0) {
        const sumItems = items.reduce((acc, it) => acc + (it.total_price || 0), 0);
        totalAmount = Math.max(0, sumItems - discountVal);
      }
    } catch (fetchErr: any) {
      console.error("Erro no fetch/parse da SEFAZ:", fetchErr.message);
    }

    if (isNaN(totalAmount) || totalAmount <= 0) {
      totalAmount = 50.0;
    }

    // 4. Gravar na tabela purchases
    const { data: newPurchase, error: purchaseError } = await supabaseAdmin
      .from("purchases")
      .insert({
        user_id,
        access_key: accessKey,
        store_name: storeName,
        total_amount: totalAmount,
        purchase_date: new Date().toISOString().split("T")[0],
      })
      .select()
      .single();

    if (purchaseError) {
      return new Response(JSON.stringify({ error: purchaseError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Inserir itens individuais
    if (items.length > 0 && newPurchase?.id) {
      const itemsPayload = items.map((it) => ({
        purchase_id: newPurchase.id,
        user_id: user_id,
        name: it.name,
        quantity: it.quantity,
        unit_price: it.unit_price,
        total_price: it.total_price,
      }));
      await supabaseAdmin.from("purchase_items").insert(itemsPayload);
    }

    // 6. Se for um evento, não cria transação no orçamento geral 50/30/20
    if (!event_id) {
      const { data: account } = await supabaseAdmin
        .from("accounts")
        .select("id")
        .eq("user_id", user_id)
        .limit(1)
        .single();

      const storeUpper = storeName.toUpperCase();
      let targetCategory = "Supermercado";

      if (
        storeUpper.includes("MODA") ||
        storeUpper.includes("C&A") ||
        storeUpper.includes("CA ") ||
        storeUpper.includes("RENNER") ||
        storeUpper.includes("RIACHUELO") ||
        storeUpper.includes("ZARA")
      ) {
        targetCategory = "Vestuário & Moda";
      } else if (
        storeUpper.includes("DROGA") ||
        storeUpper.includes("FARMACIA") ||
        storeUpper.includes("RAIA") ||
        storeUpper.includes("PANVEL") ||
        storeUpper.includes("NISSEI")
      ) {
        targetCategory = "Saúde & Farmácia";
      } else if (
        storeUpper.includes("RESTAURANTE") ||
        storeUpper.includes("PIZZARIA") ||
        storeUpper.includes("BURGER") ||
        storeUpper.includes("BAR")
      ) {
        targetCategory = "Lazer & Restaurantes";
      }

      let { data: category } = await supabaseAdmin
        .from("categories")
        .select("id")
        .eq("user_id", user_id)
        .ilike("name", `%${targetCategory}%`)
        .maybeSingle();

      if (!category) {
        const { data: defaultCat } = await supabaseAdmin
          .from("categories")
          .select("id")
          .eq("user_id", user_id)
          .eq("name", "Supermercado")
          .maybeSingle();
        category = defaultCat;
      }

      await supabaseAdmin.from("transactions").insert({
        user_id,
        account_id: account?.id,
        category_id: category?.id,
        description: `NFC-e: ${storeName}`,
        amount: totalAmount,
        type: "expense",
        date: new Date().toISOString().split("T")[0],
        is_settled: true,
        purchase_id: newPurchase?.id,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        store_name: storeName,
        total_amount: totalAmount.toFixed(2),
        items_count: items.length,
        access_key: accessKey,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});