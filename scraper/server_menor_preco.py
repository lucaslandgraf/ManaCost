import re
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app)

# 1. Mapa de substituição de caracteres da cifra da Celepar
DECODE_MAP = {
    'J': 'A',
    'Z': 'G',
    'L': 'R',
    'Q': 'A',
    'X': 'O',
    'M': 'N',
    'V': 'C',
    'F': 'P',
    'Y': 'U',
    'K': 'C',
    'W': 'S',
}

# 2. Dicionário de termos conhecidos de estabelecimentos e endereços de Londrina e PR
KNOWN_WORDS = {
    "ESTACIO": "ESTACAO",
    "CJPR": "CAFE",
    "CERJEJL": "CERVEJA",
    "CERTEJS": "CERVEJA",
    "TEERA": "TERRA",
    "ALKIMENTODS": "ALIMENTOS",
    "TECSOLOFIA": "TECNOLOGIA",
    "TECLOLOZIA": "TECNOLOGIA",
    "FOMD": "FOOD",
    "SERJICE": "SERVICE",
    "YLTRA": "ULTRA",
    "BOD": "BOM",
    "VISTQ": "VISTA",
    "VIUA": "VILA",
    "VEHA": "VELHA",
    "JUXUTUQUARA": "UMBARA",
    "AYRIANOBOLISF": "ADRIANOPOLIS",
    "ADOGANOS": "ADUANAS",
    "CRISPOZ": "CRISPO",
    "HERMILIF": "HERCILIO",
    "HERMILIL": "HERCILIO",
    "BABTIGE": "BAPTISTA",
    "PFERFEITAO": "PERFEITO",
    "SAOOR": "SABOR",
    "CLUBEH": "CLUBE",
    "BODIZA": "BOLINHA",
    "LULXOO": "LUXO",
    "ROUPASR": "ROUPAS",
    "DEQICACTO": "DEDICACAO",
    "GOCE": "DOCE",
    "MEFCERIA": "MERCERIA",
    "FERININX": "FEMININO",
    "ARVORSE": "ARVORES",
    "CEAA": "CENA",
    "FRGENDS": "FRIENDS",
}

def decode_celepar_text(text: str) -> str:
    """Aplica a decodificação de substituição e normalização de palavras."""
    if not text:
        return ""
    
    words = text.split()
    corrected_words = []
    
    for w in words:
        upper_w = w.upper()
        # Se a palavra for conhecida no dicionário, troca direto
        if upper_w in KNOWN_WORDS:
            corrected_words.append(KNOWN_WORDS[upper_w])
            continue
        
        # Limpa repetições de letras anômalas (ex: PFERFEITAO -> PERFEITO)
        cleaned = re.sub(r'([A-Z])\1+', r'\1', upper_w)
        
        # Se após limpar casar com o dicionário
        if cleaned in KNOWN_WORDS:
            corrected_words.append(KNOWN_WORDS[cleaned])
            continue
            
        corrected_words.append(upper_w)
        
    return " ".join(corrected_words)

def encode_geohash(lat, lon, precision=9):
    BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'
    min_lat, max_lat = -90.0, 90.0
    min_lon, max_lon = -180.0, 180.0
    is_even = True
    bit = 0
    ch = 0
    geohash = []

    while len(geohash) < precision:
        if is_even:
            mid = (min_lon + max_lon) / 2
            if lon > mid:
                ch |= (1 << (4 - bit))
                min_lon = mid
            else:
                max_lon = mid
        else:
            mid = (min_lat + max_lat) / 2
            if lat > mid:
                ch |= (1 << (4 - bit))
                min_lat = mid
            else:
                max_lat = mid
        is_even = not is_even
        if bit < 4:
            bit += 1
        else:
            geohash.append(BASE32[ch])
            bit = 0
            ch = 0
    return "".join(geohash)

@app.route('/menor-preco', methods=['POST'])
def menor_preco():
    data = request.get_json() or {}
    termo = data.get('termo', '').strip()
    lat = float(data.get('latitude', -23.3045))
    lon = float(data.get('longitude', -51.1696))
    raio = int(data.get('raio', 10))

    if not termo:
        return jsonify({'error': 'Termo de busca obrigatório'}), 400

    local_hash = encode_geohash(lat, lon, 9)
    url = "https://menorpreco.notaparana.pr.gov.br/api/v1/produtos"
    
    params = {
        "local": local_hash,
        "termo": termo,
        "offset": "0",
        "raio": str(raio),
        "data": "-1",
        "ordem": "0"
    }

    headers = {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "Referer": f"https://menorpreco.notaparana.pr.gov.br/app?termo={termo}&local={local_hash}",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }

    try:
        r = requests.get(url, params=params, headers=headers, timeout=10)
        if r.status_code != 200:
            return jsonify({'error': 'Erro na Celepar', 'status': r.status_code}), 502

        raw_data = r.json()
        produtos = []
        for item in raw_data.get('produtos', []):
            estab = item.get('estabelecimento', {})
            end_parts = [estab.get('tp_logr'), estab.get('nm_logr'), estab.get('nr_logr')]
            raw_endereco = " ".join([p for p in end_parts if p])
            
            raw_nome = estab.get('nm_fan') or estab.get('nm_emp') or 'Estabelecimento'
            raw_bairro = estab.get('bairro', '')

            # Aplica a decodificação inteligente
            nome_limpo = decode_celepar_text(raw_nome)
            endereco_limpo = decode_celepar_text(raw_endereco)
            bairro_limpo = decode_celepar_text(raw_bairro)
            desc_limpa = decode_celepar_text(item.get('desc') or termo)
            
            produtos.append({
                'id': item.get('id'),
                'descricao': desc_limpa,
                'valor': float(str(item.get('valor', 0)).replace(',', '.')),
                'valorOriginal': float(str(item.get('valor_tabela', 0)).replace(',', '.')) if item.get('valor_tabela') else None,
                'dataHora': item.get('datahora'),
                'tempoRelativo': item.get('tempo', 'recente'),
                'distanciaKm': f"{float(item.get('distkm', 0)):.1f}" if item.get('distkm') else None,
                'estabelecimento': {
                    'nome': nome_limpo,
                    'endereco': endereco_limpo,
                    'bairro': bairro_limpo,
                    'municipio': estab.get('mun', 'Londrina'),
                    'latitude': estab.get('latitude'),
                    'longitude': estab.get('longitude')
                }
            })

        return jsonify({'total': len(produtos), 'produtos': produtos})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)