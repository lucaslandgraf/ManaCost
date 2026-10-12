import re
import unicodedata

def clean_text(text: str) -> str:
    """Remove acentos, caracteres especiais excessivos e padroniza espaços."""
    if not text:
        return ""
    # Normalização Unicode (remove acentos)
    text = unicodedata.normalize('NFKD', text).encode('ASCII', 'ignore').decode('utf-8')
    text = text.upper()
    # Substitui separadores comuns por espaço
    text = re.sub(r'[\/\-_,;]', ' ', text)
    # Remove espaços repetidos
    return re.sub(r'\s+', ' ', text).strip()

def standardize_units(text: str) -> str:
    """Padroniza gramaturas, quilos, litros e mililitros."""
    text = clean_text(text)
    
    # Padroniza gramas: '500 GR', '500 GRAMAS', '500G' -> '500G'
    text = re.sub(r'(\d+)\s*(?:GR|GRAMAS|G)\b', r'\1G', text)
    
    # Padroniza quilogramas decimais: '0.5 KG', '0,5KG' -> '500G'
    def _convert_fractional_kg(match):
        val = float(match.group(1).replace(',', '.'))
        return f"{int(val * 1000)}G"
    text = re.sub(r'(\d+[,\.]\d+)\s*(?:KG|KILOS?)\b', _convert_fractional_kg, text)
    
    # Padroniza quilogramas inteiros: '1 KG', '1KILO' -> '1KG'
    text = re.sub(r'(\d+)\s*(?:KG|QUILOS?|KILOS?)\b', r'\1KG', text)
    
    # Padroniza mililitros: '350 ML', '350MLS' -> '350ML'
    text = re.sub(r'(\d+)\s*(?:MLS?|MILILITROS?)\b', r'\1ML', text)
    
    # Padroniza litros inteiros: '1 L', '1 LITRO' -> '1L'
    text = re.sub(r'(\d+)\s*(?:L|LTS?|LITROS?)\b', r'\1L', text)
    
    return re.sub(r'\s+', ' ', text).strip()