import time
import urllib.parse
from datetime import datetime, timedelta
import requests
import random
import time

try:
    from normalizer import standardize_units
except ImportError:
    def standardize_units(text: str) -> str:
        return text

try:
    from .terms import EXPANDED_SEARCH_TERMS
except ImportError:
    from terms import EXPANDED_SEARCH_TERMS


def scrape_atacadao_deals() -> list[dict]:
    """Coleta produtos essenciais no Atacadão via Catalog Search da VTEX."""
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
    }

    search_queries = EXPANDED_SEARCH_TERMS

    print(f"[Atacadão] Processando {len(search_queries)} termos via catálogo VTEX...")

    for query in search_queries:
        encoded_query = urllib.parse.quote(query)
        url = (
            f"https://www.atacadao.com.br/api/catalog_system/pub/products/search"
            f"?ft={encoded_query}&_from=0&_to=11"
        )

        try:
            resp = requests.get(url, headers=headers, timeout=12)

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
                                "store_name": "Atacadão",
                                "product_name": standardize_units(raw_name),
                                "deal_price": float(price),
                                "category": query.split()[0].capitalize(),
                                "valid_until": valid_until,
                                "image_url": image_url,
                            })
                            added_count += 1

                print(f"  -> '{query}': {added_count} produtos adicionados")
            else:
                print(f"[Atacadão] Aviso: status {resp.status_code} ao consultar '{query}'")

        except Exception as e:
            print(f"[Atacadão] Erro ao consultar '{query}': {e}")

        time.sleep(0.8)

    unique_deals = {}
    for deal in deals:
        unique_deals[deal["product_name"]] = deal

    final_list = list(unique_deals.values())
    print(f"[Atacadão] Extração concluída: {len(final_list)} produtos únicos coletados.")
    return final_list