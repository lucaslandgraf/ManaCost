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


def _clean_price(value) -> float:
    """Converte valores como '11', '11.50', 'R$ 11,90' para float seguro."""
    if not value:
        return 0.0
    text = str(value).strip().replace("R$", "").strip()
    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".")
    elif "," in text:
        text = text.replace(",", ".")
    try:
        return float(re.sub(r"[^\d.]", "", text))
    except (ValueError, TypeError):
        return 0.0


def scrape_almeida_deals() -> list[dict]:
    """
    Coleta produtos no Almeida Mercados (Londrina) via endpoint Live Search do OpenCart.
    """
    deals = []
    valid_until = (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d")

    headers = {
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Cookie": "favorite_store1=4; language=pt-br; currency=BRL",
        "Referer": "https://www.almeidamercados.com/",
    }

    search_queries = [
        "arroz", "feijao", "oleo", "cafe", "acucar", "macarrao",
        "farinha", "leite", "molho", "sal", "frango", "carne",
        "ovos", "queijo", "presunto", "batata", "tomate", "cebola",
        "banana", "detergente", "sabao", "amaciante", "desinfetante",
        "agua sanitaria", "papel higienico", "creme dental", "sabonete"
    ]

    print(f"[Almeida] Processando {len(search_queries)} termos via Live Search...")

    for query in search_queries:
        encoded_term = urllib.parse.quote(query)
        url = (
            f"https://www.almeidamercados.com/index.php"
            f"?route=extension/module/live_search&filter_name={encoded_term}"
        )

        try:
            resp = requests.get(url, headers=headers, timeout=12)

            if resp.status_code == 200:
                payload = resp.json()
                products = payload.get("products", []) if isinstance(payload, dict) else []
                added_count = 0

                for item in products:
                    raw_name = item.get("name", "").strip()
                    # Remove reticências que o OpenCart insere no autocomplete
                    clean_name = re.sub(r"\.{2,}$", "", raw_name).strip()

                    special_price = _clean_price(item.get("special"))
                    regular_price = _clean_price(item.get("price"))
                    final_price = special_price if special_price > 0 else regular_price

                    img_url = item.get("image") or None
                    if img_url and not img_url.startswith("http"):
                        img_url = f"https://www.almeidamercados.com/image/{img_url}"

                    if final_price > 0 and clean_name:
                        deals.append({
                            "store_name": "Almeida",
                            "product_name": standardize_units(clean_name),
                            "deal_price": final_price,
                            "category": query.capitalize(),
                            "valid_until": valid_until,
                            "image_url": img_url,
                        })
                        added_count += 1

                print(f"  -> '{query}': {added_count} produtos adicionados")
            else:
                print(f"[Almeida] Aviso: status {resp.status_code} ao consultar '{query}'")

        except Exception as e:
            print(f"[Almeida] Erro ao consultar '{query}': {e}")

        time.sleep(0.3)

    unique_deals = {}
    for deal in deals:
        unique_deals[deal["product_name"]] = deal

    final_list = list(unique_deals.values())
    print(f"[Almeida] Extração concluída: {len(final_list)} produtos únicos coletados.")
    return final_list