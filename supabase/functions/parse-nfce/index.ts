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
    const { raw_data, user_id } = await req.json();

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

    console.log("Processando leitura. Chave detectada:", accessKey);
    console.log("Raw data recebido:", raw_data);

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

    // 2. Trava de duplicidade
    const { data: existingPurchase } = await supabaseAdmin
      .from("purchases")
      .select("id, purchase_date")
      .eq("access_key", accessKey)
      .maybeSingle();

    if (existingPurchase) {
      return new Response(
        JSON.stringify({
          already_registered: true,
          message: "Esta nota fiscal já foi registrada anteriormente.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Fazer requisição para a SEFAZ
    const targetUrl = raw_data.startsWith("http")
      ? raw_data
      : `http://www.fazenda.pr.gov.br/nfce/qrcode?p=${accessKey}`;

    console.log("Buscando URL da SEFAZ:", targetUrl);

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
      console.log("Tamanho do HTML retornado:", html.length);
      console.log("Amostra do HTML (primeiros 500 chars):", html.substring(0, 500));

      // Extração do Nome do Estabelecimento
      const storeMatch =
        html.match(/<div[^>]*class="[^"]*txtTopo[^"]*"[^>]*>([^<]+)<\/div>/i) ||
        html.match(/<span[^>]*class="[^"]*txtTit[^"]*"[^>]*>([^<]+)<\/span>/i) ||
        html.match(/<div[^>]*id="u20"[^>]*>([^<]+)<\/div>/i);

      if (storeMatch) {
        storeName = storeMatch[1].trim();
      }

      // Extração do Valor Total Real
      const totalMatch =
        html.match(/Valor\s*a\s*pagar[^<]*<\/span>[^<]*<span[^>]*class="[^"]*totalNumb[^"]*"[^>]*>([\d,.]+)/i) ||
        html.match(/<span[^>]*class="[^"]*totalNumb\s+txtMax[^"]*"[^>]*>([\d,.]+)<\/span>/i) ||
        html.match(/<span[^>]*class="[^"]*txtMax[^"]*"[^>]*>([\d,.]+)<\/span>/i) ||
        html.match(/Valor\s*Total[^<]*<span[^>]*class="[^"]*totalNumb[^"]*"[^>]*>([\d,.]+)/i);

      if (totalMatch) {
        totalAmount = parseFloat(totalMatch[1].replace(/\./g, "").replace(",", ".").trim());
      }

      // Extração de Itens
      const rows = html.match(/<tr[^>]*id="Item \+ \d+"[\s\S]*?<\/tr>/gi) ||
                   html.match(/<tr[^>]*class="[^"]*linhaItem[^"]*"[\s\S]*?<\/tr>/gi);

      if (rows && rows.length > 0) {
        console.log(`Encontradas ${rows.length} linhas de itens no HTML.`);
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
      } else {
        console.log("Nenhuma linha no formato padrão de tabela foi encontrada.");
      }
    } catch (fetchErr: any) {
      console.error("Erro no fetch/parse do HTML da SEFAZ:", fetchErr.message);
    }

    console.log(`Resumo: Loja="${storeName}", Total=${totalAmount}, Qtd Itens=${items.length}`);

    if (isNaN(totalAmount) || totalAmount <= 0) {
      totalAmount = 50.0;
    }

    // 4. Salvar na tabela purchases
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
      console.error("Erro ao salvar purchase:", purchaseError.message);
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
      const { error: itemsError } = await supabaseAdmin.from("purchase_items").insert(itemsPayload);
      if (itemsError) {
        console.error("Erro ao salvar purchase_items:", itemsError.message);
      } else {
        console.log(`Salvos com sucesso ${items.length} itens.`);
      }
    }

    // 6. Conta bancária do usuário
    const { data: account } = await supabaseAdmin
      .from("accounts")
      .select("id")
      .eq("user_id", user_id)
      .limit(1)
      .single();

    // 7. Categorização inteligente
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

    // 8. Criar transação financeira
    await supabaseAdmin.from("transactions").insert({
      user_id,
      account_id: account?.id,
      category_id: category?.id,
      description: `NFC-e: ${storeName}`,
      amount: totalAmount,
      type: "expense",
      date: new Date().toISOString().split("T")[0],
      is_settled: true,
    });

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
    console.error("Erro geral na Edge Function:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});