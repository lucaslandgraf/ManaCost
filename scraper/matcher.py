import os
import re
from collections import defaultdict
from dotenv import load_dotenv
from supabase import create_client, Client
from normalizer import generate_canonical_key, is_match
from datetime import datetime, timezone

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Configurações do Supabase ausentes no .env.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def fetch_all_deals() -> list[dict]:
    """Busca todas as ofertas com id, loja, nome, preço, imagem e categoria."""
    print("[Matcher] Puxando ofertas do Supabase...")
    all_deals = []
    page_size = 1000
    start = 0

    while True:
        resp = (
            supabase.table("flyer_deals")
            .select("id, store_name, product_name, deal_price, image_url, category")
            .range(start, start + page_size - 1)
            .execute()
        )
        batch = resp.data or []
        all_deals.extend(batch)
        if len(batch) < page_size:
            break
        start += page_size

    print(f"[Matcher] Total carregado: {len(all_deals)} ofertas.")
    return all_deals


def extract_unit_metric(text: str) -> tuple[str, str]:
    """
    Extrai peso/volume normalizado para a mesma unidade base.
    Converte KG para G e L para ML para comparação direta.
    """
    t = text.upper()
    
    t = re.sub(r'\bT([1-9]\d?)\b', r'\1UN', t)

    match_units = re.search(r'\b(\d+)\s*(?:UNIDADES?|UN|UND)\b', t)
    units = f"{match_units.group(1)}UN" if match_units else ""

    # Unifica para G (1KG -> 1000G)
    match_kg = re.search(r'\b(\d+(?:\.\d+)?)\s*KG\b', t)
    match_g = re.search(r'\b(\d+)\s*G\b', t)
    weight = ""
    if match_kg:
        weight = f"{int(float(match_kg.group(1)) * 1000)}G"
    elif match_g:
        weight = f"{match_g.group(1)}G"
    elif re.search(r'\bKG\b', t):
        weight = "1000G"

    # Unifica para ML (1L -> 1000ML)
    match_l = re.search(r'\b(\d+(?:\.\d+)?)\s*L\b', t)
    match_ml = re.search(r'\b(\d+)\s*ML\b', t)
    volume = ""
    if match_l:
        volume = f"{int(float(match_l.group(1)) * 1000)}ML"
    elif match_ml:
        volume = f"{match_ml.group(1)}ML"

    combined_metric = weight or volume
    return units, combined_metric


def have_compatible_specs(name_a: str, name_b: str) -> bool:
    """Impede cruzamento se gramaturas ou contagens forem diferentes."""
    units_a, metric_a = extract_unit_metric(name_a)
    units_b, metric_b = extract_unit_metric(name_b)

    # 1. Bloqueia contagens divergentes (ex: 3UN vs 8UN)
    if units_a and units_b and units_a != units_b:
        return False

    # 2. Bloqueia pesos/volumes divergentes (ex: 500G vs 1000G/1KG)
    if metric_a and metric_b and metric_a != metric_b:
        return False

    # Se um deles declara peso/unidade e o outro não tem absolutamente nada, rejeita
    if bool(metric_a) != bool(metric_b):
        return False

    return True


def split_outliers_by_ratio(group: list[dict], max_ratio: float = 1.8) -> list[list[dict]]:
    """
    Separa embalagens industriais/fardos de unidades avulsas pelo rácio de preço.
    Reduzido para 1.8 (um mercado raramente é mais de 80% mais caro no mesmo produto idêntico).
    """
    sorted_items = sorted(group, key=lambda x: x["deal_price"])
    subgroups = []
    current_sub = [sorted_items[0]]

    for item in sorted_items[1:]:
        base_price = current_sub[0]["deal_price"]
        # Se ultrapassar 1.8x o valor base, pertence a outra especificação/embalagem
        if base_price > 0 and (item["deal_price"] / base_price) > max_ratio:
            subgroups.append(current_sub)
            current_sub = [item]
        else:
            current_sub.append(item)

    if current_sub:
        subgroups.append(current_sub)

    return subgroups


def clean_search_tokens(text: str) -> str:
    """Remove palavras de ruído sem apagar as unidades de peso/medida."""
    t = text.lower()
    t = re.sub(r"\b(pct|pacote|tp1|tipo 1|tipo1|vacuo|vácuo|refil|tradicional|especial)\b", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def extract_core_keywords(name: str) -> str:
    """Extrai a palavra-chave central para agrupar em baldes de busca."""
    t = clean_search_tokens(name)
    words = t.split()
    if not words:
        return "geral"

    priority_roots = [
        "ferrero", "bombom", "atum", "sardinha", "arroz", "feijao", "oleo", "azeite", 
        "cafe", "acucar", "macarrao", "espaguete", "farinha", "leite", "margarina", 
        "manteiga", "requeijao", "iogurte", "queijo", "mussarela", "presunto", 
        "achocolatado", "nescau", "toddy", "frango", "carne", "alcatra", "cerveja", 
        "refrigerante", "coca", "pepsi", "guarana", "detergente", "sabao", "amaciante", "chocolate"
    ]
    for root in priority_roots:
        if root in t:
            return root

    return words[0]


def build_clusters(deals: list[dict]) -> list[list[dict]]:
    """Gera grupos canónicos agrupando pela raiz, compatibilidade de métricas e similaridade."""
    buckets = defaultdict(list)
    for deal in deals:
        root_key = extract_core_keywords(deal["product_name"])
        buckets[root_key].append(deal)

    merged_clusters = []

    for root, items in buckets.items():
        visited = set()
        for i, deal_a in enumerate(items):
            deal_a_id = deal_a.get("id") or f"{deal_a['store_name']}-{deal_a['product_name']}"
            if deal_a_id in visited:
                continue

            current_group = [deal_a]
            visited.add(deal_a_id)

            for j in range(i + 1, len(items)):
                deal_b = items[j]
                deal_b_id = deal_b.get("id") or f"{deal_b['store_name']}-{deal_b['product_name']}"
                if deal_b_id in visited:
                    continue

                if deal_a["store_name"] == deal_b["store_name"]:
                    continue

                # 1. Trava estrita de contagem e peso (ex: impede 3UN com 8UN ou 12UN)
                if not have_compatible_specs(deal_a["product_name"], deal_b["product_name"]):
                    continue

                # 2. Similaridade de texto com limiar calibrado
                if is_match(deal_a["product_name"], deal_b["product_name"], threshold=78.0):
                    current_group.append(deal_b)
                    visited.add(deal_b_id)

            # Separa outliers com rácio estrito de 1.8x
            refined_subgroups = split_outliers_by_ratio(current_group, max_ratio=1.8)
            for sub in refined_subgroups:
                best_by_store = {}
                for item in sorted(sub, key=lambda x: x["deal_price"]):
                    store = item["store_name"]
                    if store not in best_by_store:
                        best_by_store[store] = item

                if len(best_by_store) > 1:
                    merged_clusters.append(list(best_by_store.values()))

    return merged_clusters


def persist_matches_to_supabase(clusters: list[list[dict]]):
    """Grava os agrupamentos consolidados nas tabelas product_matches e product_match_items."""
    if not clusters:
        print("[Matcher] Nenhum agrupamento para gravar.")
        return

    print("[Persistência] Limpando agrupamentos anteriores...")
    supabase.table("product_match_items").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    supabase.table("product_matches").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()

    print(f"\n[Persistência] Preparando {len(clusters)} produtos cruzados para o Supabase...")

    matches_payload = []
    cluster_index_map = {}
    now_iso = datetime.now(timezone.utc).isoformat()

    for idx, group in enumerate(clusters):
        sorted_group = sorted(group, key=lambda x: x["deal_price"])
        cheapest = sorted_group[0]
        priciest = sorted_group[-1]

        canonical_key = generate_canonical_key(cheapest["product_name"]) or f"cluster-{idx}"
        unique_canonical = f"{canonical_key}-{idx}"

        best_image = next(
            (d["image_url"] for d in sorted_group if d.get("image_url") and str(d["image_url"]).strip()),
            None
        )

        best_category = next(
            (d["category"] for d in sorted_group if d.get("category") and str(d["category"]).strip()),
            None
        )

        stores = {d["store_name"] for d in group}
        min_p = float(cheapest["deal_price"])
        max_p = float(priciest["deal_price"])

        matches_payload.append({
            "canonical_key": unique_canonical,
            "display_name": cheapest["product_name"],
            "category": best_category,
            "stores_count": len(stores),
            "min_price": min_p,
            "max_price": max_p,
            "spread": round(max_p - min_p, 2),
            "cheapest_store": cheapest["store_name"],
            "priciest_store": priciest["store_name"],
            "image_url": best_image,
            "updated_at": now_iso,
        })
        cluster_index_map[unique_canonical] = {
            "group": sorted_group,
            "best_image": best_image,
        }

    print(f"[Persistência] Enviando registros para 'product_matches'...")
    batch_size = 50
    inserted_matches = []

    for i in range(0, len(matches_payload), batch_size):
        chunk = matches_payload[i:i + batch_size]
        res = supabase.table("product_matches").upsert(
            chunk,
            on_conflict="canonical_key"
        ).execute()
        if res.data:
            inserted_matches.extend(res.data)

    print(f"✓ {len(inserted_matches)} cabeçalhos de matches gravados/atualizados.")

    items_payload = []
    for match_row in inserted_matches:
        match_id = match_row["id"]
        canonical_key = match_row["canonical_key"]
        cluster_data = cluster_index_map.get(canonical_key, {})
        origin_deals = cluster_data.get("group", [])
        shared_image = cluster_data.get("best_image")

        for deal in origin_deals:
            item_image = deal.get("image_url") or shared_image

            items_payload.append({
                "match_id": match_id,
                "deal_id": deal.get("id"),
                "store_name": deal["store_name"],
                "raw_product_name": deal["product_name"],
                "price": float(deal["deal_price"]),
                "image_url": item_image,
            })

    print(f"[Persistência] Enviando {len(items_payload)} ofertas filhas para 'product_match_items'...")
    for i in range(0, len(items_payload), batch_size):
        chunk = items_payload[i:i + batch_size]
        supabase.table("product_match_items").upsert(
            chunk,
            on_conflict="match_id,store_name,raw_product_name"
        ).execute()

    print("✓ Persistência relacional concluída com sucesso!")


def main():
    deals = fetch_all_deals()
    clusters = build_clusters(deals)
    print(f"\n✓ {len(clusters)} clusters concorrentes identificados com especificações estritas.")
    persist_matches_to_supabase(clusters)


if __name__ == "__main__":
    main()