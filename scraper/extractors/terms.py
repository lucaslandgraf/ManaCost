"""
Termos de busca consolidados para os scrapers do ManaCost (Londrina - PR)
"""

# Termos otimizados para busca semântica/específica (ex: Muffato, Atacadão)
EXPANDED_SEARCH_TERMS = [
    # Mercearia / Básicos
    "arroz 5kg", "feijao carioca", "feijao preto", "oleo de soja",
    "cafe torrado", "acucar refinado", "acucar cristal", "macarrao espaguete",
    "macarrao parafuso", "farinha de trigo", "farinha de mandioca",
    "molho de tomate", "sal refinado", "maionese", "ketchup",
    "vinagre de alcool", "azeite de oliva", "milho verde lata", "sardinha em lata",

    # Laticínios e Matinais
    "leite integral", "leite desnatado", "leite condensado", "creme de leite",
    "manteiga com sal", "margarina", "requeijao cremoso", "iogurte natural",
    "achocolatado po", "biscoito cream cracker", "biscoito recheado", "pao de forma",

    # Açougue e Proteínas
    "carne moida", "contra file", "alcatra", "coxao mole", "acem",
    "costela bovina", "peito de frango", "coxa e sobrecoxa", "linguica toscana",
    "bisteca suina", "lombo suino", "bacon", "salsicha hot dog",
    "ovos brancos", "ovos vermelhos",

    # Fiambreria
    "queijo mucarela fatiado", "presunto cozido", "queijo prato fatiado", "mortadela",

    # Hortifrúti (Feira)
    "batata lavada", "cebola", "tomate", "alho", "cenoura", "beterraba",
    "abobrinha", "banana prata", "banana nanica", "maca nacional",
    "laranja pera", "limao taiti", "mamao formosa", "melancia",

    # Limpeza e Cuidados com a Casa
    "detergente liquido", "sabao em po", "sabao liquido lava roupas",
    "amaciante concentrado", "desinfetante", "agua sanitaria",
    "alcool 70", "esponja de aco", "esponja multiuso", "multiuso limpador",
    "inseticida spray", "saco para lixo 50l", "amaciante tradicional",

    # Higiene Pessoal e Perfumaria
    "papel higienico folha dupla", "sabonete em barra", "sabonete liquido",
    "creme dental", "escova de dente", "shampoo", "condicionador",
    "desodorante aerosol", "absorvente", "fio dental", "algodao",

    # Bebidas
    "refrigerante coca cola", "refrigerante guarana", "suco integral uva",
    "cerveja pilsen lata", "agua mineral sem gas"
]

# Termos curtos/genéricos para APIs que não suportam buscas compostas (ex: Viscardi, Santarém, Almeida)
SHORT_SEARCH_TERMS = [
    # Básicos
    "arroz", "feijao", "oleo", "cafe", "acucar", "macarrao", "farinha",
    "molho", "sal", "maionese", "ketchup", "azeite", "vinagre",
    # Laticínios & Café da manhã
    "leite", "manteiga", "margarina", "requeijao", "iogurte", "achocolatado",
    "biscoito", "pao",
    # Carnes & Proteínas
    "carne", "frango", "linguica", "suino", "bacon", "salsicha", "ovos",
    # Queijos & Frios
    "queijo", "presunto", "mortadela",
    # Hortifrúti
    "batata", "cebola", "tomate", "alho", "cenoura", "banana", "maca", "laranja", "limao",
    # Limpeza
    "detergente", "sabao", "amaciante", "desinfetante", "agua sanitaria",
    "multiuso", "esponja", "lixo",
    # Higiene
    "papel higienico", "sabonete", "creme dental", "shampoo", "condicionador",
    "desodorante", "absorvente",
    # Bebidas
    "refrigerante", "cerveja", "suco", "agua"
]