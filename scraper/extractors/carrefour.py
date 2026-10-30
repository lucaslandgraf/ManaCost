import re
import time
import urllib.parse
from datetime import datetime, timedelta
import requests

try:
    from normalizer import standardize_units
except ImportError:
    def standardize_units(text: str) -> str:
        return text

try:
    from .terms import SHORT_SEARCH_TERMS
except ImportError:
    try:
        from terms import SHORT_SEARCH_TERMS
    except ImportError:
        SHORT_SEARCH_TERMS = ["arroz", "feijao", "leite", "oleo", "cafe", "acucar", "frango", "carne", "cerveja"]


def scrape_carrefour_deals() -> list[dict]:
    deals = []
    valid_until = (datetime.now() + timedelta(days=6)).strftime("%Y-%m-%d")

    headers = {
        "Accept": "application/json",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Cookie": (
            "vtex_segment=eyJjdXJyZW5jeUNvZGUiOiJCUkwiLCJjdXJyZW5jeVN5bWJvbCI6IlIkIiw"
            "iY291bnRyeUNvZGUiOiJCUkEiLCJjdWx0dXJlSW5mbyI6InB0LUJSIiwiZmFjZXRzIjoiemlwLWNvZGU9ODYwMjAtMDMwOyJ9;"
            "cep_carrefour_ja=86020-030;"
        ),
    }

    print(f"[Carrefour] Coletando {len(SHORT_SEARCH_TERMS)} termos via API VTEX...")

    for query in SHORT_SEARCH_TERMS:
        encoded_term = urllib.parse.quote(query)
        # Ordenar por relevância (ScoreDESC) em vez de Preço Mínimo evita que sachês e sacolas dominem os primeiros resultados
        url = (
            f"https://carrefourbrfood.vtexcommercestable.com.br/api/catalog_system/pub/products/search/{encoded_term}"
            f"?_from=0&_to=19&O=OrderByScoreDESC"
        )

        try:
            resp = requests.get(url, headers=headers, timeout=12)

            if resp.status_code in (200, 206):
                products = resp.json()
                added = 0

                if isinstance(products, list):
                    for item in products:
                        raw_name = item.get("productName") or item.get("productTitle") or ""
                        
                        items_list = item.get("items", [])
                        if not items_list:
                            continue

                        first_sku = items_list[0]
                        sellers = first_sku.get("sellers", [])
                        if not sellers:
                            continue

                        comm = sellers[0].get("commertialOffer", {})
                        price = float(comm.get("Price", 0.0) or 0.0)
                        available = comm.get("AvailableQuantity", 0) > 0

                        # Se for inferior a 70 cêntimos ou tiver cara de fração de atacado, descarta
                        if price < 0.70:
                            continue

                        norm_name = standardize_units(raw_name.strip())

                        # Ignora caixas com centenas de unidades por menos de R$ 5
                        if re.search(r'\b([2-9]\d|\d{3,})\s*(UNIDADES?|UN|SACHES?)\b', norm_name.upper()) and price < 5.00:
                            continue

                        images = first_sku.get("images", [])
                        img_url = images[0].get("imageUrl") if images else None

                        if available and price > 0 and norm_name:
                            deals.append({
                                "store_name": "Carrefour",
                                "product_name": norm_name,
                                "deal_price": price,
                                "category": query.capitalize(),
                                "valid_until": valid_until,
                                "image_url": img_url,
                            })
                            added += 1

                print(f"  -> '{query}': {added} itens adicionados")
            else:
                print(f"[Carrefour] Status {resp.status_code} para '{query}'")

        except Exception as e:
            print(f"[Carrefour] Erro ao consultar '{query}': {e}")

        time.sleep(0.4)

    unique = {d["product_name"]: d for d in deals}
    final_list = list(unique.values())
    print(f"[Carrefour] Concluído: {len(final_list)} produtos adicionados.")
    return final_list


if __name__ == "__main__":
    res = scrape_carrefour_deals()
    print(f"Total coletado: {len(res)}")