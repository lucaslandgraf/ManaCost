import re
import unicodedata
from rapidfuzz import fuzz

STOP_WORDS = {
    "TIPO", "TIPO1", "TIPO2", "TP", "PCT", "PACOTE", "PCTE", "EMB", "EMBALAGEM",
    "UN", "UND", "UNIDADE", "UNIDADES", "SACO", "CX", "CAIXA", "PET", "LATA",
    "REFIL", "TRADICIONAL", "ESPECIAL", "PROMOCAO", "OFERTA", "GRATIS", "LEVE", "PAGUE"
}


def clean_text(text: str) -> str:
    """Remove acentos, caracteres especiais excessivos e padroniza espaços."""
    if not text:
        return ""
    text = unicodedata.normalize('NFKD', text).encode('ASCII', 'ignore').decode('utf-8')
    text = text.upper()
    text = re.sub(r'[\/\-_,;.]', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()


def standardize_units(text: str) -> str:
    """Padroniza gramaturas, quilos, litros e mililitros."""
    text = clean_text(text)

    # 1. Quilogramas decimais: '0.5 KG', '0,5KG' -> '500G'
    def _convert_fractional_kg(match):
        val = float(match.group(1).replace(',', '.'))
        return f"{int(val * 1000)}G"
    text = re.sub(r'(\d+[,\.]\d+)\s*(?:KG|KILOS?)\b', _convert_fractional_kg, text)

    # 2. Quilogramas inteiros: '1 KG', '1KILO' -> '1KG'
    text = re.sub(r'(\d+)\s*(?:KG|QUILOS?|KILOS?)\b', r'\1KG', text)

    # 3. Gramas: se >= 1000 e múltiplo de 1000, unifica para KG (ex: 5000g -> 5KG)
    def _normalize_grams(match):
        val = int(match.group(1))
        if val >= 1000 and val % 1000 == 0:
            return f"{val // 1000}KG"
        return f"{val}G"
    text = re.sub(r'(\d+)\s*(?:GR|GRAMAS?|G)\b', _normalize_grams, text)

    # 4. Litros inteiros: '1 L', '1 LITRO' -> '1L'
    text = re.sub(r'(\d+)\s*(?:L|LTS?|LITROS?)\b', r'\1L', text)

    # 5. Mililitros: se >= 1000 e múltiplo de 1000, unifica para L (ex: 1000ml -> 1L)
    def _normalize_ml(match):
        val = int(match.group(1))
        if val >= 1000 and val % 1000 == 0:
            return f"{val // 1000}L"
        return f"{val}ML"
    text = re.sub(r'(\d+)\s*(?:MLS?|MILILITROS?)\b', _normalize_ml, text)

    return re.sub(r'\s+', ' ', text).strip()


def extract_unit(standardized_name: str) -> tuple[str, str]:
    """
    Separa o nome limpo da unidade padronizada.
    Ex: 'ARROZ TIO JOAO 5KG' -> ('ARROZ TIO JOAO', '5KG')
    """
    match = re.search(r'\b(\d+(?:KG|G|L|ML))\b', standardized_name)
    if match:
        unit = match.group(1)
        name_without_unit = re.sub(r'\b' + unit + r'\b', '', standardized_name)
        return re.sub(r'\s+', ' ', name_without_unit).strip(), unit
    return standardized_name, ""


def generate_canonical_key(raw_name: str) -> str:
    """
    Gera um identificador slug ordenado para agrupamento exato.
    Ex: 'Arroz Branco Tio João Tipo 1 5kg' -> 'ARROZ-BRANCO-TIO-JOAO-5KG'
    """
    std = standardize_units(raw_name)
    name_clean, unit = extract_unit(std)

    tokens = [
        word for word in name_clean.split()
        if word not in STOP_WORDS and len(word) > 1
    ]

    base = "-".join(tokens)
    return f"{base}-{unit}" if unit else base


def is_match(name_a: str, name_b: str, threshold: float = 80.0) -> bool:
    """
    Verifica similaridade garantindo que unidades diferentes nunca se cruzem.
    Ex: 'Feijão Carioca 1kg' e 'Feijão Carioca 2kg' -> False
    """
    std_a = standardize_units(name_a)
    std_b = standardize_units(name_b)

    clean_a, unit_a = extract_unit(std_a)
    clean_b, unit_b = extract_unit(std_b)

    # Bloqueia se as unidades forem divergentes
    if unit_a and unit_b and unit_a != unit_b:
        return False

    # Filtra stop words antes da comparação semântica
    tokens_a = " ".join([w for w in clean_a.split() if w not in STOP_WORDS])
    tokens_b = " ".join([w for w in clean_b.split() if w not in STOP_WORDS])

    score = fuzz.token_set_ratio(tokens_a, tokens_b)
    return score >= threshold