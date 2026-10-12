import os
import sys
from datetime import date, timedelta
from dotenv import load_dotenv
from supabase import create_client, Client
from normalizer import standardize_units

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print("Erro: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devem estar definidas.")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def fetch_sample_deals() -> list[dict]:
    """
    Simulação de recolha de encartes (Muffato, Almeida, Condor).
    Em produção, este método consome os endpoints das redes ou faz parsing HTML.
    """
    valid_date = (date.today() + timedelta(days=5)).isoformat()
    
    raw_payload = [
        {"store": "Super Muffato", "raw_name": "Arroz Branco Tipo 1 Tio Joao - Pacote 5 Kg", "price": 24.90},
        {"store": "Super Muffato", "raw_name": "Cafe Tradicional Pilao a vacuo 500 gr", "price": 15.99},
        {"store": "Super Muffato", "raw_name": "Leite UHT Integral Piracanjuba 1 litro", "price": 4.29},
        {"store": "Almeida Mercados", "raw_name": "Detergente Liquido Neutro Ype 500ml", "price": 1.99},
        {"store": "Almeida Mercados", "raw_name": "Oleo de Soja Refinado Soya 900 ml", "price": 5.49},
        {"store": "Condor", "raw_name": "Sabao em Po Omo Lavagem Perfeita 1,6kg", "price": 19.90},
        {"store": "Condor", "raw_name": "Papel Higienico Neve F. Dupla 30m c/ 12 un", "price": 18.50},
    ]

    processed = []
    for item in raw_payload:
        processed.append({
            "store_name": item["store"],
            "product_name": standardize_units(item["raw_name"]),
            "deal_price": item["price"],
            "valid_until": valid_date,
        })
    return processed

def run_ingestion():
    deals = fetch_sample_deals()
    print(f"Preparando envio de {len(deals)} ofertas normalizadas...")

    for deal in deals:
        print(f" -> [{deal['store_name']}] {deal['product_name']} por R$ {deal['deal_price']}")

    # Inserção na tabela flyer_deals
    res = supabase.table("flyer_deals").insert(deals).execute()
    print(f"Ingestão concluída com sucesso! Registos inseridos.")

if __name__ == "__main__":
    run_ingestion()