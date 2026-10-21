import re
import time
import urllib.parse
from datetime import datetime, timedelta
from curl_cffi import requests

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


def scrape_carrefour_deals() -> list[dict]:
    deals = []
    valid_until = (datetime.now() + timedelta(days=6)).strftime("%Y-%m-%d")

    # Inicia sessão com impersonate do Chrome para manter cookies e bypass do WAF
    session = requests.Session(impersonate="chrome124")

    # 1. Warm-up da sessão com o CEP de Londrina
    try:
        session.get(
            "https://mercado.carrefour.com.br/",
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"},
            timeout=15
        )
        session.cookies.set("cep_carrefour_ja", "86020-030", domain=".carrefour.com.br")
    except Exception as e:
        print(f"[Carrefour] Aviso no handshake inicial: {e}")

    headers = {
        "Accept": "*/*",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "Referer": "https://mercado.carrefour.com.br/",
    }

    print(f"[Carrefour] Coletando {len(SHORT_SEARCH_TERMS)} termos via API...")

    for query in SHORT_SEARCH_TERMS:
        encoded_term = urllib.parse.quote(query)
        url = (
            f"https://mercado.carrefour.com.br/busca.data"
            f"?term={encoded_term}&isPharmacy=false"
            f"&_routes=layout%2Fdefault%2Croutes%2Fbusca%2Croutes%2Fbusca._index"
        )

        try:
            resp = session.get(url, headers=headers, timeout=15)

            if resp.status_code == 200:
                data = resp.json()

                busca_data = (
                    data.get("routes/busca._index", {})
                    or data.get("routes/busca", {})
                    or {}
                )

                search_result = busca_data.get("searchResult", {}) or busca_data.get("products", [])
                products = (
                    search_result.get("products", [])
                    if isinstance(search_result, dict)
                    else (search_result if isinstance(search_result, list) else [])
                )

                if not products and isinstance(busca_data, dict):
                    for v in busca_data.values():
                        if isinstance(v, dict) and "products" in v and isinstance(v["products"], list):
                            products = v["products"]
                            break

                added = 0
                for item in products:
                    name = item.get("productName") or item.get("name") or ""
                    price = 0.0

                    items_list = item.get("items", [])
                    img_url = None
                    if items_list:
                        first_sku = items_list[0]
                        sellers = first_sku.get("sellers", [])
                        if sellers:
                            comm = sellers[0].get("commertialOffer", {})
                            price = float(comm.get("Price", 0) or 0)
                        images = first_sku.get("images", [])
                        if images:
                            img_url = images[0].get("imageUrl")

                    if price <= 0:
                        price_obj = item.get("price") or item.get("spotPrice")
                        if isinstance(price_obj, dict):
                            price = float(price_obj.get("value", 0) or 0)
                        else:
                            price = _clean_price(price_obj)

                    if not img_url:
                        img_url = item.get("imageUrl") or item.get("image")

                    if price > 0 and name:
                        deals.append({
                            "store_name": "Carrefour",
                            "product_name": standardize_units(name.strip()),
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

        time.sleep(0.8)

    unique = {d["product_name"]: d for d in deals}
    final_list = list(unique.values())
    print(f"[Carrefour] Concluído: {len(final_list)} produtos adicionados.")
    return final_list


if __name__ == "__main__":
    res = scrape_carrefour_deals()
    print(f"Total: {len(res)} | Exemplo: {res[0] if res else 'Vazio'}")