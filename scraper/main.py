import os
import re
from datetime import datetime, timedelta
import requests
from bs4 import BeautifulSoup
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Configurações do Supabase ausentes no .env.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def clean_price(price_str: str) -> float:
    """
    Normaliza valores monetários aceitando tanto padrão BR (1.234,90 ou 19,90)
    quanto padrão US/sistema (1,234.90 ou 19.90).
    """
    if not price_str:
        return 0.0

    # Remove símbolos de moeda, espaços e caracteres não numéricos/pontuação
    clean = re.sub(r"[^\d,\.]", "", str(price_str)).strip()
    if not clean:
        return 0.0

    # Caso 1: Contém vírgula (Padrão brasileiro, ex: "1.234,90" ou "23,90")
    if "," in clean:
        clean = clean.replace(".", "").replace(",", ".")
    # Caso 2: Não tem vírgula, mas tem ponto (Padrão internacional/direto, ex: "1,234.90" ou "23.90")
    elif "." in clean:
        parts = clean.split(".")
        # Se houver múltiplos pontos (ex: "1.234.567"), junta tudo menos o último se for decimal
        if len(parts) > 2:
            clean = "".join(parts[:-1]) + "." + parts[-1]

    try:
        return float(clean)
    except ValueError:
        return 0.0


def scrape_supermarket_offers():
    """
    Exemplo base de extrator. 
    Pode ser adaptado para endpoints JSON de redes locais ou sites de folhetos.
    """
    deals = []
    
    # Exemplo simulando raspagem de ofertas da semana (válidas por 5 dias)
    valid_until = (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d")
    
    # Lista de ofertas de demonstração estruturadas para teste inicial no banco
    mock_offers = [
        {
            "store_name": "Muffato",
            "product_name": "Arroz Branco Tipo 1 5kg",
            "price": 23.90,
            "category": "Mercearia",
            "valid_until": valid_until,
            "image_url": "https://placehold.co/400x400/png?text=Arroz+5kg",
        },
        {
            "store_name": "Muffato",
            "product_name": "Leite UHT Integral 1L",
            "price": 4.49,
            "category": "Laticínios",
            "valid_until": valid_until,
            "image_url": "https://placehold.co/400x400/png?text=Leite+1L",
        },
        {
            "store_name": "Condor",
            "product_name": "Café Tradicional 500g",
            "price": 14.89,
            "category": "Matinais",
            "valid_until": valid_until,
            "image_url": "https://placehold.co/400x400/png?text=Cafe+500g",
        },
        {
            "store_name": "Almeida",
            "product_name": "Detergente Líquido 500ml",
            "price": 2.19,
            "category": "Limpeza",
            "valid_until": valid_until,
            "image_url": "https://placehold.co/400x400/png?text=Detergente",
        },
    ]
    
    deals.extend(mock_offers)
    return deals


def sync_deals_to_supabase(deals):
    """Envia ou atualiza as ofertas na tabela flyer_deals do Supabase."""
    print(f"Sincronizando {len(deals)} ofertas com o Supabase...")
    
    for deal in deals:
        try:
            # upsert atualiza o preço e validade se o produto já existir na loja
            supabase.table("flyer_deals").upsert(
                deal, 
                on_conflict="store_name,product_name"
            ).execute()
            print(f"✓ Sincronizado: [{deal['store_name']}] {deal['product_name']} - R$ {deal['price']}")
        except Exception as e:
            print(f"✗ Erro ao sincronizar {deal['product_name']}: {e}")


if __name__ == "__main__":
    print("Iniciando raspagem de encartes...")
    extracted_deals = scrape_supermarket_offers()
    sync_deals_to_supabase(extracted_deals)
    print("Processamento concluído.")