import logging
import time
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List
import requests

try:
    from normalizer import standardize_units
except ImportError:
    def standardize_units(text: str) -> str:
        return text

try:
    from .terms import EXPANDED_SEARCH_TERMS
except ImportError:
    from terms import EXPANDED_SEARCH_TERMS

logger = logging.getLogger(__name__)


class CondorScraper:
    BASE_URL = "https://sense.osuper.com.br/314/{store_id}/v2/search"

    def __init__(self, store_id: str = "1441"):
        self.store_id = store_id
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "Origin": "https://www.condor.com.br",
            "Referer": "https://www.condor.com.br/",
            "Accept": "application/json, text/plain, */*",
        })

    def search(self, query: str, max_items: int = 10) -> List[Dict[str, Any]]:
        """Pesquisa produtos no catálogo do Condor com suporte a paginação."""
        url = self.BASE_URL.format(store_id=self.store_id)
        products: List[Dict[str, Any]] = []
        next_from = 0

        while len(products) < max_items:
            params: Dict[str, Any] = {"search": query}
            if next_from > 0:
                params["from"] = next_from

            try:
                response = self.session.get(url, params=params, timeout=10)
                response.raise_for_status()
                data = response.json()
            except requests.RequestException as e:
                logger.error("Erro ao consultar a API do Condor para '%s': %s", query, e)
                break

            hits = data.get("hits", [])
            if not hits:
                break

            for item in hits:
                if len(products) >= max_items:
                    break

                pricing = item.get("pricing", {})
                stock_info = item.get("quantity", {})

                promo_p = pricing.get("promotionalPrice")
                normal_p = pricing.get("price")
                final_price = promo_p if promo_p and promo_p > 0 else normal_p

                unit_type = str(item.get("unit") or pricing.get("unit") or "").lower()

                product = {
                    "id": item.get("id"),
                    "name": item.get("name"),
                    "brand": item.get("brandName"),
                    "price": final_price,
                    "unit": unit_type,
                    "in_stock": stock_info.get("inStock", 0) > 0,
                    "image_url": item.get("image"),
                }
                products.append(product)

            if not data.get("hasNext"):
                break

            next_from = data.get("nextFrom", 0)

        return products


def scrape_condor_deals() -> list[dict]:
    """
    Função principal consumida pelo pipeline (main.py).
    Itera por todos os termos expandidos e consolida as ofertas do Condor Londrina.
    """
    scraper = CondorScraper()
    deals = []
    valid_until = (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d")

    print(f"[Condor] Processando {len(EXPANDED_SEARCH_TERMS)} termos via API Sense...")

    for query in EXPANDED_SEARCH_TERMS:
        try:
            items = scraper.search(query, max_items=6)
            added_count = 0
            for item in items:
                raw_name = item.get("name", "")
                price = item.get("price")
                in_stock = item.get("in_stock", True)
                unit_type = item.get("unit", "")

                if not raw_name or not price or float(price) <= 0 or not in_stock:
                    continue

                # Garante que cortes de carne com preço por quilo recebam 1KG explícito
                clean_name = raw_name.strip()
                if unit_type in ("kg", "kilo") or re.search(r'\bkg\b', clean_name, re.I):
                    if not re.search(r'\d+\s*(?:kg|g)\b', clean_name, re.I):
                        clean_name = f"{clean_name} 1KG"

                deals.append({
                    "store_name": "Hiper Condor",
                    "product_name": standardize_units(clean_name),
                    "deal_price": float(price),
                    "category": query.split()[0].capitalize(),
                    "valid_until": valid_until,
                    "image_url": item.get("image_url"),
                })
                added_count += 1
            print(f"  -> '{query}': {added_count} produtos adicionados")
        except Exception as e:
            print(f"[Condor] Erro no termo '{query}': {e}")

        time.sleep(0.8)

    unique_deals = {}
    for deal in deals:
        unique_deals[deal["product_name"]] = deal

    final_list = list(unique_deals.values())
    print(f"[Condor] Extração concluída: {len(final_list)} produtos únicos coletados.")
    return final_list


if __name__ == "__main__":
    results = scrape_condor_deals()
    print(f"Total coletado: {len(results)}")