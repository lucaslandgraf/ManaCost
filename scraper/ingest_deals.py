import os
import sys
from datetime import date, timedelta
from dotenv import load_dotenv
from supabase import create_client, Client
from extractors.muffato import scrape_muffato_deals

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print("Erro: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devem estar definidas.")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def run_ingestion():
    print("Iniciando ingestão de ofertas em tempo real...")

    # 1. Coleta das redes
    all_deals = scrape_muffato_deals()

    if not all_deals:
        print("Nenhuma oferta capturada. Abortando execução.")
        return

    # 2. Define validade para 7 dias à frente
    valid_until_date = (date.today() + timedelta(days=7)).isoformat()
    for deal in all_deals:
        deal["valid_until"] = valid_until_date

    # 3. Upsert no Supabase baseado na constraint (store_name, product_name)
    print(f"Persistindo {len(all_deals)} ofertas via upsert...")
    supabase.table("flyer_deals").upsert(
        all_deals,
        on_conflict="store_name,product_name"
    ).execute()

    print("Pipeline de ingestão finalizado com sucesso!")

if __name__ == "__main__":
    run_ingestion()