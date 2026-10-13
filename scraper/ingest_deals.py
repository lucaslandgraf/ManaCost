import os
import sys
from datetime import date, timedelta
from dotenv import load_dotenv
from supabase import create_client, Client
from extractors.muffato import scrape_muffato_deals
from extractors.almeida import scrape_almeida_deals
from extractors.condor import scrape_condor_deals

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print("Erro: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devem estar definidas.")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def run_ingestion():
    print("Iniciando ingestao de ofertas de Londrina (Muffato + Almeida + Condor)...")

    all_deals = []

    # 1. Super Muffato (API VTEX Londrina)
    try:
        muffato_deals = scrape_muffato_deals()
        all_deals.extend(muffato_deals)
        print(f"Super Muffato: {len(muffato_deals)} ofertas adicionadas.")
    except Exception as e:
        print(f"Falha no Super Muffato: {e}")

    # 2. Rede Almeida (Parsing de Encarte / Londrina)
    try:
        almeida_deals = scrape_almeida_deals()
        all_deals.extend(almeida_deals)
        print(f"Rede Almeida: {len(almeida_deals)} ofertas adicionadas.")
    except Exception as e:
        print(f"Falha no Almeida: {e}")

    # 3. Hiper Condor (Catálogo VTEX)
    try:
        condor_deals = scrape_condor_deals()
        all_deals.extend(condor_deals)
        print(f"Hiper Condor: {len(condor_deals)} ofertas adicionadas.")
    except Exception as e:
        print(f"Falha no Hiper Condor: {e}")

    if not all_deals:
        print("Nenhuma oferta capturada. Abortando execução.")
        return

    # Validade padrão de 7 dias aplicada a todos os itens coletados
    valid_until_date = (date.today() + timedelta(days=7)).isoformat()
    for deal in all_deals:
        deal["valid_until"] = valid_until_date

    # Upsert em lote no Supabase
    print(f"Persistindo {len(all_deals)} ofertas no Supabase via upsert...")
    supabase.table("flyer_deals").upsert(
        all_deals,
        on_conflict="store_name,product_name"
    ).execute()

    print("Pipeline de ingestão finalizado com sucesso para todos os mercados!")

if __name__ == "__main__":
    run_ingestion()