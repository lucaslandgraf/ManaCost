import time
import urllib.parse
from datetime import datetime, timedelta
import requests

try:
    from normalizer import standardize_units
except ImportError:
    def standardize_units(text: str) -> str:
        return text


def scrape_muffato_deals() -> list[dict]:
    """Coleta produtos essenciais no Super Muffato via Catalog Search da VTEX."""
    deals = []
    valid_until = (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d")

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "Cookie": "vtex_segment=eyJwb3N0YWxDb2RlIjoiODYwMTAtMDAwIiwiY291bnRyeSI6IkJSQSJ9",
    }

    search_queries = [
        "arroz 5kg", "feijao carioca", "feijao preto", "oleo de soja", 
        "cafe torrado", "acucar refinado", "macarrao espaguete", 
        "farinha de trigo", "leite integral", "molho de tomate", "sal refinado",
        "peito de frango", "carne moida", "contra file", 
        "ovos brancos", "queijo mucarela fatiado", "presunto cozido",
        "batata lavada", "tomate longa vida", "cebola", "banana prata",
        "detergente liquido", "sabao em po", "amaciante concentrado", 
        "desinfetante", "agua sanitaria", "papel higienico folha dupla", 
        "creme dental", "sabonete em barra"
    ]

    print(f"[Muffato] Processando {len(search_queries)} termos com catálogo direto...")

    for query in search_queries:
        encoded_query = urllib.parse.quote(query)
        url = (
            f"https://www.supermuffato.com.br/api/catalog_system/pub/products/search"
            f"?ft={encoded_query}&_from=0&_to=5"
        )

        try:
            resp = requests.get(url, headers=headers, timeout=12)

            # VTEX responde 206 quando retorna uma fatia paginada com sucesso
            if resp.status_code in (200, 206):
                products = resp.json()
                added_count = 0

                if isinstance(products, list):
                    for prod in products:
                        raw_name = prod.get("productName", "")
                        items = prod.get("items", [])
                        if not items:
                            continue

                        sellers = items[0].get("sellers", [])
                        if not sellers:
                            continue

                        comm_offer = sellers[0].get("commertialOffer", {})
                        price = comm_offer.get("Price", 0)
                        available = comm_offer.get("AvailableQuantity", 0) > 0

                        images = items[0].get("images", [])
                        image_url = images[0].get("imageUrl") if images else None

                        if price > 0 and available and raw_name:
                            deals.append({
                                "store_name": "Super Muffato",
                                "product_name": standardize_units(raw_name),
                                "deal_price": float(price),
                                "category": query.split()[0].capitalize(),
                                "valid_until": valid_until,
                                "image_url": image_url,
                            })
                            added_count += 1

                print(f"  -> '{query}': {added_count} produtos adicionados")
            else:
                print(f"[Muffato] Aviso: status {resp.status_code} ao consultar '{query}'")

        except Exception as e:
            print(f"[Muffato] Erro ao consultar '{query}': {e}")

        time.sleep(0.3)

    unique_deals = {}
    for deal in deals:
        unique_deals[deal["product_name"]] = deal

    final_list = list(unique_deals.values())
    print(f"[Muffato] Extração concluída: {len(final_list)} produtos únicos coletados.")
    return final_list