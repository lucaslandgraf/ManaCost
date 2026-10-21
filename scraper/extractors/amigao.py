import json
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


def _clean_price(val) -> float:
    if not val:
        return 0.0
    text = str(val).strip().replace("R$", "").strip()
    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".")
    elif "," in text:
        text = text.replace(",", ".")
    try:
        return float(re.sub(r"[^\d.]", "", text))
    except (ValueError, TypeError):
        return 0.0


def scrape_amigao_deals() -> list[dict]:
    deals = []
    valid_until = (datetime.now() + timedelta(days=6)).strftime("%Y-%m-%d")

    headers = {
        "Accept": "*/*",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Referer": "https://www.amigao.com/",
    }

    op_hash = "ae50c5a735b1464f0ba48be4f2b32f7289ce6284"

    print(f"[Amigão] Coletando {len(SHORT_SEARCH_TERMS)} termos via GetProductsQuery...")

    for query in SHORT_SEARCH_TERMS:
        variables = {
            "input": {
                "activeSalesChannel": "1",
                "postalCode": "86070-545",
                "page": 0,
                "selectedFacets": [],
                "term": query,
                "hasChangeOrder": False,
                "hasClubWithRegion": True,
                "cmsPostalCode": "87014-070",
                "clubSc": 2,
                "disableSearchCache": True,
                "disableCartSimulation": False,
                "itemsPerPage": 20,
                "regionId": "v2.44076B33C824A4276C80B1C1FA184C37",
            }
        }

        encoded_variables = urllib.parse.quote(json.dumps(variables))
        url = (
            f"https://www.amigao.com/api/graphql"
            f"?operationName=GetProductsQuery"
            f"&operationHash={op_hash}"
            f"&variables={encoded_variables}"
        )

        try:
            resp = requests.get(url, headers=headers, timeout=12)

            if resp.status_code == 200:
                data = resp.json()
                
                # Acesso direto à chave 'products' confirmada
                gp_data = data.get("data", {}).get("getProducts", {}).get("data", {})
                products_list = gp_data.get("products", [])

                added = 0
                for item in products_list:
                    # Se por acaso o item vier como string ou formato inválido, ignora com segurança
                    if not isinstance(item, dict):
                        continue

                    node = item.get("node", item)
                    if not isinstance(node, dict):
                        continue

                    name = node.get("name") or node.get("productName") or ""

                    # Extração de preço
                    price = 0.0
                    offers = node.get("offers", {})
                    if isinstance(offers, dict):
                        price = float(offers.get("lowPrice") or offers.get("price") or 0)
                        if price <= 0:
                            sub_offers = offers.get("offers", [])
                            if sub_offers and isinstance(sub_offers, list):
                                for sub in sub_offers:
                                    if isinstance(sub, dict) and sub.get("price"):
                                        price = float(sub.get("price", 0) or 0)
                                        break

                    if price <= 0:
                        price = _clean_price(node.get("price") or node.get("spotPrice"))

                    # Extração de imagem
                    img_url = None
                    images = node.get("image") or node.get("images")
                    if isinstance(images, list) and images:
                        first_img = images[0]
                        if isinstance(first_img, dict):
                            img_url = first_img.get("url")
                        elif isinstance(first_img, str):
                            img_url = first_img
                    elif isinstance(images, dict):
                        img_url = images.get("url")

                    if price > 0 and name:
                        deals.append({
                            "store_name": "Amigão Supermercados",
                            "product_name": standardize_units(name.strip()),
                            "deal_price": price,
                            "category": query.capitalize(),
                            "valid_until": valid_until,
                            "image_url": img_url,
                        })
                        added += 1

                print(f"  -> '{query}': {added} itens adicionados")
            else:
                print(f"[Amigão] Status {resp.status_code} para '{query}'")

        except Exception as e:
            print(f"[Amigão] Erro ao consultar '{query}': {e}")

        time.sleep(0.4)

    unique_deals = {d["product_name"]: d for d in deals}
    final_list = list(unique_deals.values())
    print(f"[Amigão] Concluído: {len(final_list)} produtos catalogados.")
    return final_list


if __name__ == "__main__":
    items = scrape_amigao_deals()
    print(f"Total: {len(items)} | Exemplo: {items[0] if items else 'Vazio'}")