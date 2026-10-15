import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const termo = body.termo || '';
    const latitude = body.latitude || -23.3045;
    const longitude = body.longitude || -51.1696;
    const raio = body.raio || 10;
    const offset = body.offset || 0;

    if (!termo) {
      return new Response(
        JSON.stringify({ error: 'Termo de busca é obrigatório.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload = {
      termo,
      localizacao: {
        latitude: Number(latitude),
        longitude: Number(longitude),
      },
      raio: Number(raio),
      offset: Number(offset),
    };

    const celeparRes = await fetch('https://menorpreco.notaparana.pr.gov.br/api/v1/produtos', {
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json;charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Mobile Safari/537.36',
        'Localizacao': `${latitude},${longitude}`,
        'Latitude': String(latitude),
        'Longitude': String(longitude),
        'Raio': String(raio),
      },
      body: JSON.stringify(payload),
    });

    if (!celeparRes.ok) {
      const errorText = await celeparRes.text();
      console.error('Erro na Celepar:', celeparRes.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Falha na resposta da Celepar', status: celeparRes.status, details: errorText }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await celeparRes.json();
    const listaRaw = data.produtos || [];

    const produtos = listaRaw.map((item: any) => ({
      id: item.id || String(Math.random()),
      descricao: item.desc || item.descricao || termo,
      valor: parseFloat(String(item.valor || 0).replace(',', '.')),
      valorOriginal: item.valor_tabela ? parseFloat(String(item.valor_tabela).replace(',', '.')) : null,
      dataHora: item.datahora || null,
      tempoRelativo: item.tempo || 'recente',
      distanciaKm: item.distancia ? Number(item.distancia).toFixed(1) : null,
      estabelecimento: {
        nome: item.estabelecimento?.nm_fantasia || item.estabelecimento?.nm_empresa || item.local || 'Estabelecimento Local',
        cnpj: item.estabelecimento?.cnpj || '',
        endereco: item.estabelecimento?.ds_logradouro ? `${item.estabelecimento.ds_logradouro}, ${item.estabelecimento.nu_logradouro || 's/n'}` : '',
        bairro: item.estabelecimento?.nm_bairro || '',
        municipio: item.estabelecimento?.nm_municipio || 'Londrina',
        latitude: item.estabelecimento?.latitude,
        longitude: item.estabelecimento?.longitude,
      },
    }));

    return new Response(
      JSON.stringify({ total: produtos.length, produtos }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Exceção interna na Edge Function:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Erro interno na Edge Function' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});