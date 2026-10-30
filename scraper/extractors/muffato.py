import time
import re
import urllib.parse
from datetime import datetime, timedelta
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


def scrape_muffato_deals() -> list[dict]:
    """Coleta produtos essenciais no Super Muffato (Filial Londrina Duque) via API VTEX."""
    deals = []
    valid_until = (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d")

    # Segmento configurado com CEP central de Londrina (Duque de Caxias)
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "Cookie": (
            "vtex_segment=eyJjdXJyZW5jeUNvZGUiOiJCUkwiLCJjdXJyZW5jeVN5bWJvbCI6IlIkIiw"
            "iY291bnRyeUNvZGUiOiJCUkEiLCJjdWx0dXJlSW5mbyI6InB0LUJSIiwiZmFjZXRzIjoiemlwLWNvZGU9ODYwMTUtMDAwOyJ9;"
            "cep_supermuffato=86015-000;"
        ),
    }

    search_queries = EXPANDED_SEARCH_TERMS

    print(f"[Muffato] Processando {len(search_queries)} termos com catálogo direto Londrina...")

    for query in search_queries:
        encoded_query = urllib.parse.quote(query)
        url = (
            f"https://www.supermuffato.com.br/api/catalog_system/pub/products/search"
            f"?ft={encoded_query}&_from=0&_to=15"
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

                        first_item = items[0]
                        sellers = first_item.get("sellers", [])
                        if not sellers:
                            continue

                        comm_offer = sellers[0].get("commertialOffer", {})
                        
                        price = float(comm_offer.get("spotPrice") or comm_offer.get("Price") or 0.0)
                        available = comm_offer.get("AvailableQuantity", 0) > 0

                        # Trata multiplicador de peso da VTEX (ex: peça de 2.1kg)
                        unit_multiplier = float(first_item.get("unitMultiplier") or 1.0)
                        if unit_multiplier > 1.05 and price > 0:
                            price = price / unit_multiplier

                        clean_name = raw_name.strip()
                        # Normaliza termos que vendem por quilo para 1KG explícito
                        if re.search(r'\bkg\b', clean_name, re.I) and not re.search(r'\d+\s*(?:kg|g)\b', clean_name, re.I):
                            clean_name = f"{clean_name} 1KG"

                        images = first_item.get("images", [])
                        image_url = images[0].get("imageUrl") if images else None

                        if price > 0 and available and clean_name:
                            deals.append({
                                "store_name": "Super Muffato",
                                "product_name": standardize_units(clean_name),
                                "deal_price": round(price, 2),
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

        time.sleep(0.5)

    unique_deals = {}
    for deal in deals:
        unique_deals[deal["product_name"]] = deal

    final_list = list(unique_deals.values())
    print(f"[Muffato] Extração concluída: {len(final_list)} produtos únicos coletados.")
    return final_list


if __name__ == "__main__":
    results = scrape_muffato_deals()
    print(f"Total coletado: {len(results)}")