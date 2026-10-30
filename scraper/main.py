import os
import sys
import re
from datetime import date
from dotenv import load_dotenv
from supabase import create_client, Client

from extractors.condor import scrape_condor_deals
from extractors.muffato import scrape_muffato_deals
from extractors.atacadao import scrape_atacadao_deals
from extractors.viscardi import scrape_viscardi_deals
from extractors.santarem import scrape_santarem_deals
from extractors.almeida import scrape_almeida_deals
from extractors.amigao import scrape_amigao_deals     
from extractors.carrefour import scrape_carrefour_deals 
from extractors.angeloni import scrape_angeloni_deals

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


def is_valid_deal(deal: dict) -> bool:
    """Filtra aberrações de preços, frações de sachês e erros de cadastro da API."""
    price = float(deal.get("deal_price") or 0.0)
    name = (deal.get("product_name") or "").upper()

    # 1. Regra básica: nenhum produto no catálogo geral custa menos de 70 centavos
    if price < 0.70:
        return False

    # 2. Regra de peso/volume vs preço mínimo:
    # Se tiver mais de 500g ou 1L/1000ml, o produto não pode custar menos de R$ 2,00
    has_large_weight = bool(re.search(r'\b([5-9]\d{2}|[1-9]\d{3,})G\b|\b(\d+KG|\d+L|\d{4,}ML)\b', name))
    if has_large_weight and price < 2.00:
        return False

    # 3. Regra de atacado/fardo/caixas (ex: 168 UNIDADES, CX com dezenas de itens)
    has_bulk_quantity = bool(re.search(r'\b([2-9]\d|\d{3,})\s*(UNIDADES?|UN|SACHES?|LATAS?)\b|\b(CX|FARDO)\b', name))
    if has_bulk_quantity and price < 5.00:
        return False

    return True


def sync_deals_to_supabase(deals: list):
    """Sincroniza os produtos em lote (batch upsert) no Supabase após higienização."""
    if not deals:
        print("Nenhuma oferta para sincronizar.")
        return

    # Higienização dos dados
    clean_deals = [d for d in deals if is_valid_deal(d)]
    removed_count = len(deals) - len(clean_deals)
    if removed_count > 0:
        print(f"[Sanitização] {removed_count} produtos com preços anômalos/sachês foram descartados.")

    print(f"\nSincronizando {len(clean_deals)} ofertas com o Supabase em lote...")
    batch_size = 50
    for i in range(0, len(clean_deals), batch_size):
        batch = clean_deals[i:i + batch_size]
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

    cleanup_expired_deals()

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

    if target in ("amigao", "all"):
        all_deals.extend(scrape_amigao_deals())

    if target in ("carrefour", "all"):
        all_deals.extend(scrape_carrefour_deals())

    if target in ("angeloni", "all"):
        all_deals.extend(scrape_angeloni_deals())

    sync_deals_to_supabase(all_deals)

    print("\n=== PIPELINE CONCLUÍDO COM SUCESSO ===")