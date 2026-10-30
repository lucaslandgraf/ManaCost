import json
import logging
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List
import requests

try:
    from normalizer import standardize_units
except ImportError:
    def standardize_units(text: str) -> str:
        return text

try:
    from .terms import SHORT_SEARCH_TERMS
except ImportError:
    from terms import SHORT_SEARCH_TERMS

logger = logging.getLogger(__name__)


class AngeloniExtractor:
    BASE_URL = "https://super.angeloni.com.br"
    STORE_NAME = "Super Angeloni"

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json",
            "sec-ch-ua": '"Not:A-Brand";v="8", "Chromium";v="124", "Brave";v="124"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
        })

    def search_term(self, term: str) -> List[Dict[str, Any]]:
        url = f"{self.BASE_URL}/{term}"
        params = {
            "_q": term,
            "map": "ft",
            "__pickRuntime": "queryData",
            "__device": "tablet",
        }
        headers = {
            "Referer": f"{self.BASE_URL}/{term}?_q={term}&map=ft",
        }

        try:
            resp = self.session.get(url, params=params, headers=headers, timeout=6)
            if resp.status_code != 200:
                return []

            payload = resp.json()
            query_data = payload.get("queryData", [])

            for block in query_data:
                raw_data = block.get("data")
                if not raw_data:
                    continue

                if isinstance(raw_data, str):
                    try:
                        raw_data = json.loads(raw_data)
                    except Exception:
                        continue

                if isinstance(raw_data, dict):
                    prod_search = raw_data.get("productSearch")
                    if isinstance(prod_search, dict):
                        products = prod_search.get("products", [])
                        if products:
                            return self._parse_vtex_products(products)
        except Exception:
            return []

        return []

    def _parse_vtex_products(self, products: list) -> List[Dict[str, Any]]:
        deals = []
        for p in products:
            if not isinstance(p, dict):
                continue

            try:
                name = p.get("productName") or p.get("productTitle")
                items = p.get("items", [])
                if not items or not name:
                    continue

                first_item = items[0]
                images = first_item.get("images", [])
                image_url = images[0].get("imageUrl") if images else None

                sellers = first_item.get("sellers", [])
                if not sellers:
                    continue

                offer = sellers[0].get("commertialOffer", {})
                price = offer.get("Price") or offer.get("spotPrice")
                available = offer.get("AvailableQuantity", 0) > 0

                if price and float(price) > 0 and available:
                    deals.append({
                        "name": name.strip(),
                        "price": float(price),
                        "image_url": image_url,
                    })
            except Exception:
                continue
        return deals


def scrape_angeloni_deals() -> list[dict]:
    """
    Função principal consumida pelo pipeline (main.py).
    Itera pelos termos de busca e gera a lista no schema correto da tabela flyer_deals.
    """
    extractor = AngeloniExtractor()
    deals = []
    valid_until = (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d")
    total_terms = len(SHORT_SEARCH_TERMS)

    print(f"[Angeloni] Processando {total_terms} termos via VTEX IO...")

    for idx, query in enumerate(SHORT_SEARCH_TERMS, 1):
        try:
            items = extractor.search_term(query)
            added_count = 0
            for item in items:
                raw_name = item.get("name")
                price = item.get("price")

                if raw_name and price and float(price) > 0:
                    deals.append({
                        "store_name": "Super Angeloni",
                        "product_name": standardize_units(raw_name),
                        "deal_price": float(price),
                        "category": query.split()[0].capitalize(),
                        "valid_until": valid_until,
                        "image_url": item.get("image_url"),
                    })
                    added_count += 1

            print(f"[{idx:02d}/{total_terms}] ✓ '{query}': {added_count} produtos adicionados | Total: {len(deals)}")
        except Exception as e:
            print(f"[{idx:02d}/{total_terms}] ✗ Erro no termo '{query}': {e}")

        time.sleep(0.4)

    # Deduplicação por product_name
    unique_deals = {}
    for deal in deals:
        unique_deals[deal["product_name"]] = deal

    final_list = list(unique_deals.values())
    print(f"\n[Angeloni] Extração concluída: {len(final_list)} produtos únicos prontos para sincronizar.")
    return final_list


if __name__ == "__main__":
    results = scrape_angeloni_deals()
    print(f"Total coletado: {len(results)}")