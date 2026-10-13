"""
Termos de pesquisa centralizados para os extratores do ManaCost Londrina.
Estruturado com termos-raiz e marcas isoladas para maximizar o retorno das APIs.
"""

EXPANDED_SEARCH_TERMS = [
    # --- Básicos e Grãos ---
    "arroz",
    "arroz 5kg",
    "tio joao",
    "prato fino",
    "feijao",
    "feijao carioca",
    "feijao preto",
    "oleo",
    "soya",
    "liza",
    "azeite",
    "cafe",
    "cafe soluvel",
    "acucar",
    "adocante",
    "macarrao",
    "espaguete",
    "parafuso",
    "farinha",
    "farinha de trigo",
    "fuba",
    "aveia",
    "molho tomate",
    "extrato de tomate",
    "sal",
    "maionese",
    "ketchup",
    "mostarda",
    "vinagre",
    "milho verde",
    "ervilha",
    "sardinha",
    "atum",
    "biscoito",

    # --- Margarinas, Laticínios e Matinais ---
    "margarina",
    "qualy",
    "claybom",
    "doriana",
    "manteiga",
    "requeijao",
    "iogurte",
    "queijo",
    "mussarela",
    "presunto",
    "mortadela",
    "bacon",

    # --- Achocolatados, Leites & Dietas ---
    "achocolatado",
    "nescau",
    "toddy",
    "leite",
    "semidesnatado",
    "desnatado",
    "zero lactose",
    "leite condensado",
    "creme de leite",

    # --- Carnes e Proteínas ---
    "frango",
    "peito frango",
    "coxa e sobrecoxa",
    "carne moida",
    "alcatra",
    "contra file",
    "acem",
    "patinho",
    "costela",
    "bisteca",
    "linguica",
    "salsicha",
    "ovos",

    # --- Hortifrúti (FLV) ---
    "batata",
    "tomate",
    "cebola",
    "alho",
    "cenoura",
    "abobrinha",
    "chuchu",
    "banana",
    "maca",
    "laranja",
    "limao",

    # --- Limpeza e Cuidados com a Casa ---
    "detergente",
    "ype",
    "sabao",
    "omo",
    "amaciante",
    "comfort",
    "downy",
    "desinfetante",
    "agua sanitaria",
    "cloro",
    "multiuso",
    "alcool",
    "esponja",
    "bombril",
    "saco lixo",
    "papel higienico",
    "papel toalha",

    # --- Higiene Pessoal ---
    "creme dental",
    "colgate",
    "sabonete",
    "shampoo",
    "condicionador",
    "desodorante",
    "absorvente",

    # --- Bebidas e Refrigerantes ---
    "coca cola",
    "pepsi",
    "guarana",
    "sukita",
    "fanta",
    "refriko",
    "suco",
    "cerveja",
    "heineken",
    "amstel",
    "brahma",
    "skol",
    "chopp",
    "brasser",
    "agua mineral"
]

SHORT_SEARCH_TERMS = [
    # Mercearia
    "arroz", "feijao", "oleo", "soya", "azeite", "cafe", "acucar", "adocante",
    "macarrao", "espaguete", "farinha", "fuba", "aveia", "molho", "sal",
    "maionese", "ketchup", "vinagre", "milho", "ervilha", "sardinha",
    "atum", "biscoito",

    # Matinais e Laticínios
    "margarina", "qualy", "manteiga", "requeijao", "iogurte", "queijo",
    "mussarela", "presunto", "mortadela", "bacon",

    # Achocolatados e Leites
    "achocolatado", "nescau", "toddy", "leite", "semidesnatado",
    "zero lactose", "leite condensado", "creme de leite",

    # Carnes e Proteínas
    "frango", "carne", "alcatra", "contra file", "acem", "patinho",
    "costela", "bisteca", "linguica", "salsicha", "ovos",

    # Hortifrúti
    "batata", "tomate", "cebola", "alho", "cenoura", "abobrinha",
    "chuchu", "banana", "maca", "laranja", "limao",

    # Limpeza
    "detergente", "ype", "sabao", "omo", "amaciante", "desinfetante",
    "agua sanitaria", "cloro", "multiuso", "alcool", "esponja",
    "saco lixo", "papel higienico", "papel toalha",

    # Higiene
    "creme dental", "sabonete", "shampoo", "condicionador", "desodorante", "pasta de dente",

    # Bebidas
    "coca cola", "pepsi", "guarana", "sukita", "refriko", "suco",
    "cerveja", "chopp", "brasser", "agua mineral"
]