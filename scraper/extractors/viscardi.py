import time
import urllib.parse
from datetime import datetime, timedelta
import requests

try:
    from normalizer import standardize_units
except ImportError:
    def standardize_units(text: str) -> str:
        return text


def scrape_viscardi_deals() -> list[dict]:
    """
    Coleta produtos essenciais no Viscardi Delivery via VIPCommerce API.
    """
    deals = []
    valid_until = (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d")

    # Credenciais públicas de leitura extraídas da sessão do e-commerce
    token = (
        "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9."
        "eyJpc3MiOiJ2aXBjb21tZXJjZSIsImF1ZCI6ImFwaS1hZG1pbiIsInN1YiI6IjZiYzQ4NjdlLWRjYTktMTFlOS04NzQyLTAyMGQ3OTM1OWNhMCIsInZpcGNvbW1lcmNlQ2xpZW50ZUlkIjpudWxsLCJpYXQiOjE3OTE4Mjk4NzAsInZlciI6MSwiY2xpZW50IjpudWxsLCJvcGVyYXRvciI6bnVsbCwib3JnIjoiMzI3In0."
        "El4tWokJ4ys0iyabAtHR4yc9-myWfXeB2RP_eamy_CPFsDwCC-lhx1p_2_MaTWjFGvsNG3Rg5O0tKeCI3CvGIA"
    )

    headers = {
        "accept": "application/json",
        "authorization": f"Bearer {token}",
        "domainkey": "viscardidelivery.com.br",
        "organizationid": "327",
        "user-agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
    }

    # Termos básicos alinhados aos demais extratores
    search_queries = [
        "arroz", "feijao", "oleo", "cafe", "acucar", "macarrao",
        "farinha", "leite", "molho", "sal", "frango", "carne",
        "ovos", "queijo", "presunto", "batata", "tomate", "cebola",
        "banana", "detergente", "sabao", "amaciante", "desinfetante",
        "agua sanitaria", "papel higienico", "creme dental", "sabonete"
    ]

    print(f"[Viscardi] Processando {len(search_queries)} termos via VIPCommerce...")

    for query in search_queries:
        encoded_term = urllib.parse.quote(query)
        url = (
            f"https://services.vipcommerce.com.br/api-admin/v1/org/327/filial/1/"
            f"centro_distribuicao/4/loja/buscas/produtos/termo/{encoded_term}?page=1"
        )

        try:
            resp = requests.get(url, headers=headers, timeout=12)

            if resp.status_code == 200:
                payload = resp.json()
                data_block = payload.get("data", {})
                
                # O payload pode vir como dict contendo a lista 'produtos' ou lista direta
                if isinstance(data_block, dict):
                    products = data_block.get("produtos", [])
                elif isinstance(data_block, list):
                    products = data_block
                else:
                    products = []

                added_count = 0
                for item in products:
                    name = item.get("descricao", "").strip()
                    available = item.get("disponivel", True)
                    raw_price = item.get("preco", 0)

                    try:
                        price = float(raw_price)
                    except (ValueError, TypeError):
                        price = 0.0

                    # Montagem da imagem a partir do identificador retornado
                    img_name = item.get("imagem")
                    image_url = (
                        f"https://static.vipcommerce.com.br/multilojas/produtos/327/{img_name}"
                        if img_name else None
                    )

                    if price > 0 and available and name:
                        deals.append({
                            "store_name": "Viscardi",
                            "product_name": standardize_units(name),
                            "deal_price": price,
                            "category": query.capitalize(),
                            "valid_until": valid_until,
                            "image_url": image_url,
                        })
                        added_count += 1

                print(f"  -> '{query}': {added_count} produtos adicionados")
            else:
                print(f"[Viscardi] Aviso: status {resp.status_code} ao consultar '{query}'")

        except Exception as e:
            print(f"[Viscardi] Erro ao consultar '{query}': {e}")

        time.sleep(0.3)

    # Desduplica por nome do produto
    unique_deals = {}
    for deal in deals:
        unique_deals[deal["product_name"]] = deal

    final_list = list(unique_deals.values())
    print(f"[Viscardi] Extração concluída: {len(final_list)} produtos únicos coletados.")
    return final_list