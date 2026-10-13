import logging
from typing import Any, Dict, List
import requests

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

    def search(self, query: str, max_items: int = 100) -> List[Dict[str, Any]]:
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
                logger.error("Erro ao consultar a API do Condor: %s", e)
                break

            hits = data.get("hits", [])
            if not hits:
                break

            for item in hits:
                if len(products) >= max_items:
                    break

                pricing = item.get("pricing", {})
                stock_info = item.get("quantity", {})

                product = {
                    "id": item.get("id"),
                    "name": item.get("name"),
                    "brand": item.get("brandName"),
                    "price": pricing.get("price"),
                    "promotional_price": pricing.get("promotionalPrice"),
                    "is_promotion": pricing.get("promotion", False),
                    "in_stock": stock_info.get("inStock", 0) > 0,
                    "stock_quantity": stock_info.get("inStock", 0),
                    "image_url": item.get("image"),
                    "product_url": (
                        f"https://www.condor.com.br/produto/{item.get('slug')}"
                        if item.get("slug")
                        else None
                    ),
                    "supermarket": "Condor",
                    "store_id": self.store_id,
                }
                products.append(product)

            if not data.get("hasNext"):
                break

            next_from = data.get("nextFrom", 0)

        return products


if __name__ == "__main__":
    scraper = CondorScraper()
    items = scraper.search("arroz", max_items=20)
    print(f"Total de itens coletados: {len(items)}\n")
    for prod in items:
        status_promo = " (PROMO)" if prod["is_promotion"] else ""
        print(f"[{prod['brand']}] {prod['name']}")
        print(f"  Preço: R$ {prod['promotional_price']}{status_promo} (Normal: R$ {prod['price']})")
        print(f"  Estoque: {prod['stock_quantity']} un | Link: {prod['product_url']}\n")