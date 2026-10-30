import json
import re
import time
import urllib.parse
from datetime import datetime, timedelta
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

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


def _build_resilient_session() -> requests.Session:
    session = requests.Session()
    retries = Retry(
        total=1,
        backoff_factor=0.5,
        status_forcelist=[500, 502, 503, 504],
        raise_on_status=False
    )
    adapter = HTTPAdapter(max_retries=retries)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


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
    session = _build_resilient_session()

    print(f"[Amigão] Coletando {len(SHORT_SEARCH_TERMS)} termos via FastStore API...")

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
                "disableCartSimulation": True,
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
            resp = session.get(url, headers=headers, timeout=10)

            if resp.status_code == 200:
                data = resp.json()
                gp_data = data.get("data", {}).get("getProducts", {}).get("data", {})
                products_obj = gp_data.get("products", {})
                edges = products_obj.get("edges", []) if isinstance(products_obj, dict) else []

                added = 0
                for edge in edges:
                    node = edge.get("node", {})
                    if not isinstance(node, dict):
                        continue

                    raw_name = node.get("name", "").strip()

                    price = 0.0
                    offers = node.get("offers", {})
                    if isinstance(offers, dict):
                        price = float(offers.get("lowPrice") or 0.0)
                        if price <= 0:
                            sub_list = offers.get("offers", [])
                            if sub_list and isinstance(sub_list, list):
                                price = float(sub_list[0].get("price", 0.0) or 0.0)

                   # 1. Multiplicador direto da API
                    try:
                        multiplier = float(node.get("unitMultiplier") or 1.0)
                    except (ValueError, TypeError):
                        multiplier = 1.0

                    # 2. Se a API não mandou multiplicador ou mandou 1.0, 
                    # inspeciona gramaturas declaradas no produto (ex: 200g, 500g, 1.5kg)
                    if multiplier == 1.0:
                        # Detecta frações em gramas (ex: 200g com título 'kg' -> multiplier = 0.2)
                        gram_match = re.search(r'\b(\d{2,4})\s*g\b', raw_name.lower())
                        kg_match = re.search(r'(\d+(?:\.\d+)?)\s*kg\b', raw_name.lower())

                        if gram_match and re.search(r'\bkg\b', raw_name.lower()):
                            grams = float(gram_match.group(1))
                            if grams > 0 and grams != 1000:
                                multiplier = grams / 1000.0  # 200g vira 0.2
                        elif kg_match:
                            val = float(kg_match.group(1))
                            if val > 1.05 or val < 0.95:
                                multiplier = val

                    # 3. Normaliza para o preço de 1KG
                    # Se multiplier < 1.0 (ex: 200g = 0.2), divide por 0.2 (multiplica por 5)
                    # Se multiplier > 1.0 (ex: 1.5kg = 1.5), divide por 1.5
                    if multiplier > 0 and multiplier != 1.0 and price > 0:
                        price = price / multiplier

                    clean_name = raw_name
                    # Se vende ao quilo ou foi convertido de fração, unifica para 1KG
                    if re.search(r'\bkg\b', clean_name, re.I):
                        # Remove menções de frações de grama (ex: '200g') se tiver 'kg'
                        clean_name = re.sub(r'\b\d{2,4}\s*g\b', '', clean_name, flags=re.I)
                        clean_name = re.sub(r'\d+(?:[.,]\d+)?\s*kg\b', '1KG', clean_name, flags=re.I)
                        if not re.search(r'\b1KG\b', clean_name, re.I):
                            clean_name = f"{clean_name} 1KG"
                        clean_name = re.sub(r'\s+', ' ', clean_name).strip()

                    img_url = None
                    images = node.get("image") or []
                    if isinstance(images, list) and images:
                        first_img = images[0]
                        img_url = first_img.get("url") if isinstance(first_img, dict) else str(first_img)
                    elif isinstance(images, dict):
                        img_url = images.get("url")

                    if price > 0 and clean_name:
                        deals.append({
                            "store_name": "Amigão Supermercados",
                            "product_name": standardize_units(clean_name),
                            "deal_price": round(price, 2),
                            "category": query.capitalize(),
                            "valid_until": valid_until,
                            "image_url": img_url,
                        })
                        added += 1

                print(f"  -> '{query}': {added} itens adicionados")
            else:
                print(f"[Amigão] Status {resp.status_code} para '{query}'")

        except Exception as e:
            print(f"[Amigão] Consulta falhou para '{query}': {e}")

        time.sleep(0.5)

    unique_deals = {d["product_name"]: d for d in deals}
    final_list = list(unique_deals.values())
    print(f"[Amigão] Concluído: {len(final_list)} produtos catalogados com sucesso.")
    return final_list


if __name__ == "__main__":
    items = scrape_amigao_deals()
    print(f"Total: {len(items)}")