import re
import unicodedata
from rapidfuzz import fuzz

STOP_WORDS = {
    "TIPO", "TIPO1", "TIPO2", "TP", "PCT", "PACOTE", "PCTE", "EMB", "EMBALAGEM",
    "UN", "UND", "UNIDADE", "UNIDADES", "SACO", "CX", "CAIXA", "PET", "LATA",
    "REFIL", "TRADICIONAL", "ESPECIAL", "PROMOCAO", "OFERTA", "GRATIS", "LEVE", "PAGUE",
    "VIDRO"
}

# Palavras que mudam a fórmula/categoria do produto e NUNCA podem ser ignoradas
CRITICAL_MODIFIERS = {
    "SELECAO", "VINTAGE", "RESERVA", "PREMIUM", "GOURMET", "ORGANICO",
    "RALADO", "SOLIDO", "PEDACOS", "FILE", "FILEZINHO", "COXA", "SOBRECOXA", "PEITO",
    "INTEGRAL", "DESNATADO", "SEMIDESNATADO", "ZERO", "LIGHT", "DIET", "LAC",
    "EXTRA", "SUAVE", "INTENSO", "CLASICO", "CLASSICO",
    "MATURATTA", "ANGUS", "WAGYU", "GRILL", "CHURRASCO", "MOIDA", "CUBOS", "ISCAS"
}


def clean_text(text: str) -> str:
    """Remove acentos, caracteres especiais excessivos e preserva decimais numéricos."""
    if not text:
        return ""
    text = unicodedata.normalize('NFKD', text).encode('ASCII', 'ignore').decode('utf-8')
    text = text.upper()

    text = re.sub(r'(\d+)[,.](\d+)', r'\1.\2', text)
    text = re.sub(r'[\/\-_;:,]', ' ', text)
    text = re.sub(r'(?<!\d)\.|\.(?!\d)', ' ', text)

    return re.sub(r'\s+', ' ', text).strip()


def standardize_units(text: str) -> str:
    """Padroniza gramaturas, quilos, litros e mililitros mantendo coerência."""
    text = clean_text(text)

    # 1. Quilogramas decimais: '0.5KG', '1.5KG' -> '500G', '1500G'
    def _convert_fractional_kg(match):
        val = float(match.group(1))
        return f"{int(val * 1000)}G"
    text = re.sub(r'(\d+\.\d+)\s*(?:KG|KILOS?|QUILOS?)\b', _convert_fractional_kg, text)

    # 2. Quilogramas inteiros: '1 KG', '1KILO' -> '1KG'
    text = re.sub(r'(\d+)\s*(?:KG|QUILOS?|KILOS?)\b', r'\1KG', text)

    # 3. Gramas: se >= 1000 e múltiplo de 1000, unifica para KG
    def _normalize_grams(match):
        val = int(match.group(1))
        if val >= 1000 and val % 1000 == 0:
            return f"{val // 1000}KG"
        return f"{val}G"
    text = re.sub(r'(\d+)\s*(?:GR|GRAMAS?|G)\b', _normalize_grams, text)

    # 4. Litros decimais: '1.5L' -> '1500ML'
    def _convert_fractional_l(match):
        val = float(match.group(1))
        return f"{int(val * 1000)}ML"
    text = re.sub(r'(\d+\.\d+)\s*(?:L|LTS?|LITROS?)\b', _convert_fractional_l, text)

    # 5. Litros inteiros
    text = re.sub(r'(\d+)\s*(?:L|LTS?|LITROS?)\b', r'\1L', text)

    # 6. Mililitros
    def _normalize_ml(match):
        val = int(match.group(1))
        if val >= 1000 and val % 1000 == 0:
            return f"{val // 1000}L"
        return f"{val}ML"
    text = re.sub(r'(\d+)\s*(?:MLS?|MILILITROS?)\b', _normalize_ml, text)

    return re.sub(r'\s+', ' ', text).strip()


def extract_unit(standardized_name: str) -> tuple[str, str]:
    """Separa o nome limpo da unidade padronizada."""
    match = re.search(r'\b(\d+(?:KG|G|L|ML))\b', standardized_name)
    if match:
        unit = match.group(1)
        name_without_unit = re.sub(r'\b' + unit + r'\b', '', standardized_name)
        return re.sub(r'\s+', ' ', name_without_unit).strip(), unit
    return standardized_name, ""


def generate_canonical_key(raw_name: str) -> str:
    """Gera um identificador slug ordenado para agrupamento exato."""
    std = standardize_units(raw_name)
    name_clean, unit = extract_unit(std)

    tokens = [
        word for word in name_clean.split()
        if word not in STOP_WORDS and len(word) > 1
    ]

    base = "-".join(tokens)
    return f"{base}-{unit}" if unit else base


def is_match(name_a: str, name_b: str, threshold: float = 78.0) -> bool:
    """
    Verifica similaridade com validação de unidades e de modificadores críticos
    (ex: impede azeite comum com 'Seleção', leite integral com desnatado, etc.)
    """
    std_a = standardize_units(name_a)
    std_b = standardize_units(name_b)

    clean_a, unit_a = extract_unit(std_a)
    clean_b, unit_b = extract_unit(std_b)

    # 1. Unidades divergentes nunca dão match
    if unit_a and unit_b and unit_a != unit_b:
        return False

    words_a = set(clean_a.split())
    words_b = set(clean_b.split())

    # 2. Modificadores críticos: se um tem 'SELECAO' e o outro não tem, REJEITA
    mods_a = words_a.intersection(CRITICAL_MODIFIERS)
    mods_b = words_b.intersection(CRITICAL_MODIFIERS)
    if mods_a != mods_b:
        return False

    # 3. Filtra stop words
    filtered_a = " ".join(sorted([w for w in words_a if w not in STOP_WORDS]))
    filtered_b = " ".join(sorted([w for w in words_b if w not in STOP_WORDS]))

    # Usa token_sort_ratio para penalizar itens que têm muitas palavras diferentes
    sort_score = fuzz.token_sort_ratio(filtered_a, filtered_b)
    set_score = fuzz.token_set_ratio(filtered_a, filtered_b)

    combined_score = (sort_score * 0.6) + (set_score * 0.4)
    return combined_score >= threshold