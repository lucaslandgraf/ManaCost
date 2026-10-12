import time
import requests
from normalizer import standardize_units

def scrape_muffato_deals() -> list[dict]:
    """
    Coleta produtos essenciais no Super Muffato via VTEX Intelligent Search,
    com controle de concorrência (rate limiting) e catálogo expandido.
    """
    deals = []

   # No scraper/extractors/muffato.py
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "pt-BR,pt;q=0.9",
        # Cookie forçando a sessão para o CEP central de Londrina
        "Cookie": "vtex_segment=eyJwb3N0YWxDb2RlIjoiODYwMTAtMDAwIiwiY291bnRyeSI6IkJSQSJ9",
}

    # Cesta básica de itens de alto consumo em supermercado
    search_queries = [
    # Cesta Básica / Mercearia Seca
    "arroz", "feijao", "oleo de soja", "cafe", "acucar", "macarrao", 
    "farinha de trigo", "leite integral", "molho de tomate", "sal refinado",
    
    # Proteínas e Frios
    "frango", "peito de frango", "carne moida", "acem", "contra file", 
    "ovos", "queijo mucarela", "presunto",
    
    # Hortifrúti Essencial
    "batata", "tomate", "cebola", "banana", "maca",
    
    # Higiene e Limpeza Doméstica
    "detergente", "sabao em po", "amaciante", "desinfetante", "agua sanitaria",
    "papel higienico", "creme dental", "sabonete", "shampoo"
]

    print(f"[Muffato] Processando {len(search_queries)} categorias essenciais...")

    for query in search_queries:
        # Aumentado para count=12 para capturar mais marcas da mesma categoria por requisição
        url = f"https://www.supermuffato.com.br/api/io/_v/api/intelligent-search/product_search/{query}?count=12&page=1"

        try:
            resp = requests.get(url, headers=headers, timeout=12)

            if resp.status_code == 200:
                data = resp.json()
                products = data.get("products", [])
                
                for prod in products:
                    name = prod.get("productName", "")
                    items = prod.get("items", [])
                    if not items:
                        continue

                    seller = items[0].get("sellers", [])[0]
                    comm_offer = seller.get("commertialOffer", {})
                    price = comm_offer.get("Price", 0)
                    available = comm_offer.get("AvailableQuantity", 0) > 0

                    if price > 0 and available and name:
                        deals.append({
                            "store_name": "Super Muffato",
                            "product_name": standardize_units(name),
                            "deal_price": float(price),
                        })
            else:
                print(f"[Muffato] Aviso: status {resp.status_code} ao consultar '{query}'")

        except Exception as e:
            print(f"[Muffato] Erro ao consultar '{query}': {e}")

        # Pausa de 0.8s entre termos para respeitar o rate limit da VTEX
        time.sleep(0.8)

    # Desduplica por nome do produto normalizado dentro do lote
    unique_deals = {}
    for deal in deals:
        unique_deals[deal["product_name"]] = deal

    print(f"[Muffato] Extração concluída: {len(unique_deals)} itens exclusivos coletados.")
    return list(unique_deals.values())