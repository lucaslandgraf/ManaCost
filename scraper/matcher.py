import os
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


def split_outliers_by_ratio(group: list[dict], max_ratio: float = 3.0) -> list[list[dict]]:
    """Separa embalagens industriais/fardos de unidades avulsas pelo rácio de preço."""
    sorted_items = sorted(group, key=lambda x: x["deal_price"])
    subgroups = []
    current_sub = [sorted_items[0]]

    for item in sorted_items[1:]:
        base_price = current_sub[0]["deal_price"]
        if base_price > 0 and (item["deal_price"] / base_price) > max_ratio:
            subgroups.append(current_sub)
            current_sub = [item]
        else:
            current_sub.append(item)

    if current_sub:
        subgroups.append(current_sub)

    return subgroups


def build_clusters(deals: list[dict]) -> list[list[dict]]:
    """Gera grupos canônicos refinados agrupando primeiro por token-raiz/categoria."""
    # 1. Agrupa por chave canônica direta
    canonical_clusters = defaultdict(list)
    for deal in deals:
        key = generate_canonical_key(deal["product_name"])
        if key:
            canonical_clusters[key].append(deal)

    # 2. Indexa por primeiro termo para não cruzar itens sem relação
    # Ex: só compara chaves que começam com 'leite' entre si
    buckets = defaultdict(list)
    for key in canonical_clusters.keys():
        first_token = key.split()[0] if key else "geral"
        buckets[first_token].append(key)

    merged_clusters = []
    visited = set()

    # 3. Faz o fuzzy matching apenas dentro do mesmo bucket (100x mais rápido)
    for bucket_keys in buckets.values():
        for i, key in enumerate(bucket_keys):
            if key in visited:
                continue

            current_group = list(canonical_clusters[key])
            visited.add(key)

            for j in range(i + 1, len(bucket_keys)):
                other_key = bucket_keys[j]
                if other_key in visited:
                    continue

                sample_a = current_group[0]["product_name"]
                sample_b = canonical_clusters[other_key][0]["product_name"]

                if is_match(sample_a, sample_b, threshold=82.0):
                    current_group.extend(canonical_clusters[other_key])
                    visited.add(other_key)

            refined_subgroups = split_outliers_by_ratio(current_group, max_ratio=3.0)
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

    # Limpeza preventiva dos agrupamentos antigos para nunca deixar sobras
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

        best_image = next((d["image_url"] for d in sorted_group if d.get("image_url")), None)
        best_category = next((d["category"] for d in sorted_group if d.get("category")), None)

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
            "updated_at": now_iso,  # <-- Coluna preenchida
        })
        cluster_index_map[unique_canonical] = sorted_group

    # 1. Batch upsert em product_matches
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

    # 2. Gravar os itens vinculados em product_match_items (já estritamente 1 por loja)
    items_payload = []
    for match_row in inserted_matches:
        match_id = match_row["id"]
        canonical_key = match_row["canonical_key"]
        origin_deals = cluster_index_map.get(canonical_key, [])

        for deal in origin_deals:
            items_payload.append({
                "match_id": match_id,
                "deal_id": deal.get("id"),
                "store_name": deal["store_name"],
                "raw_product_name": deal["product_name"],
                "price": float(deal["deal_price"]),
                "image_url": deal.get("image_url"),
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
    print(f"\n✓ {len(clusters)} clusters concorrentes identificados.")
    persist_matches_to_supabase(clusters)


if __name__ == "__main__":
    main()