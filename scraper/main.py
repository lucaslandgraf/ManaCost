import os
import sys
from datetime import date
from dotenv import load_dotenv
from supabase import create_client, Client

from extractors.condor import scrape_condor_deals
from extractors.muffato import scrape_muffato_deals
from extractors.atacadao import scrape_atacadao_deals
from extractors.viscardi import scrape_viscardi_deals
from extractors.santarem import scrape_santarem_deals
from extractors.almeida import scrape_almeida_deals

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Configurações do Supabase ausentes no .env.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def cleanup_expired_deals():
    """Remove ofertas cujo prazo de validade já expirou."""
    try:
        today_str = str(date.today())
        res = supabase.table("flyer_deals").delete().lt("valid_until", today_str).execute()
        print(f"✓ Limpeza de ofertas expiradas (< {today_str}) concluída.")
    except Exception as e:
        print(f"✗ Aviso na limpeza de ofertas expiradas: {e}")


def sync_deals_to_supabase(deals: list):
    """Sincroniza os produtos em lote (batch upsert) no Supabase."""
    if not deals:
        print("Nenhuma oferta para sincronizar.")
        return

    print(f"\nSincronizando {len(deals)} ofertas com o Supabase em lote...")
    batch_size = 50
    for i in range(0, len(deals), batch_size):
        batch = deals[i:i + batch_size]
        try:
            supabase.table("flyer_deals").upsert(
                batch,
                on_conflict="store_name,product_name"
            ).execute()
            print(f"✓ Lote {i // batch_size + 1} ({len(batch)} itens) sincronizado com sucesso!")
        except Exception as e:
            print(f"✗ Erro ao sincronizar lote {i // batch_size + 1}: {e}")


if __name__ == "__main__":
    target = sys.argv[1].lower() if len(sys.argv) > 1 else "all"
    print(f"=== INICIANDO PIPELINE MANACOST (ALVO: {target.upper()}) ===")

    # 1. Limpa registros expirados antes de rodar os scrapers
    cleanup_expired_deals()

    # 2. Coleta as ofertas
    all_deals = []

    if target in ("condor", "all"):
        all_deals.extend(scrape_condor_deals())

    if target in ("muffato", "all"):
        all_deals.extend(scrape_muffato_deals())

    if target in ("atacadao", "all"):
        all_deals.extend(scrape_atacadao_deals())

    if target in ("viscardi", "all"):
        all_deals.extend(scrape_viscardi_deals())

    if target in ("santarem", "all"):
        all_deals.extend(scrape_santarem_deals())

    if target in ("almeida", "all"):
        all_deals.extend(scrape_almeida_deals())

    # 3. Envia os dados atualizados para o banco
    sync_deals_to_supabase(all_deals)

    print("\n=== PIPELINE CONCLUÍDO COM SUCESSO ===")