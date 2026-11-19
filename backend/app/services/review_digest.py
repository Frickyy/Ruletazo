"""Resumen de reseñas de Steam: "lo bueno" y "lo malo" en frases cortas.

No hay un modelo que resuma: se toman las reseñas más votadas como útiles, se descartan
las que no sirven (dibujos con caracteres, groserías, links, gritos en mayúsculas, memes
de una línea) y de cada una se queda la primera o las dos primeras oraciones.
"""

import re
import unicodedata

# Cuántas frases se muestran de cada lado y cuánto puede medir cada una.
EXCERPTS_PER_SIDE = 3
EXCERPT_MAX_LENGTH = 220
_MIN_LENGTH = 40

# Palabras que hacen descartar la reseña entera (sin tildes y en minúscula; ver _normalize).
# En español rioplatense/España y en inglés, porque si no hay reseñas en español se usan las del resto.
_PROFANITY = {
    # español
    "mierda", "mierdas", "puta", "putas", "puto", "putos", "putada", "putisimo", "putamente", "hdp",
    "pelotudo", "pelotuda", "pelotudos", "pelotudez", "boludo", "boluda", "boludos", "boludez",
    "concha", "conchudo", "verga", "vergas", "pija", "pijas", "poronga", "carajo", "joder", "jodido",
    "jodida", "cono", "culo", "culos", "cagada", "cagadas", "cagar", "cago", "cagan", "forro", "forros",
    "idiota", "idiotas", "imbecil", "imbeciles", "estupido", "estupida", "estupidos", "subnormal",
    "maricon", "marica", "pendejo", "pendeja", "pendejos", "chinga", "chingada", "chingar", "cabron",
    "cabrones", "gilipollas", "mamada", "mamadas", "ojete", "orto", "choto", "garcha", "zorra", "perra",
    # inglés
    "fuck", "fucking", "fucked", "fucker", "fuckers", "motherfucker", "shit", "shitty", "bullshit",
    "bitch", "bitches", "ass", "asshole", "assholes", "dick", "dicks", "cunt", "cunts", "bastard",
    "retard", "retarded", "wtf", "stfu", "crap", "piss", "pissed", "slut", "whore", "fag", "faggot",
    "nigga", "nigger",
}

_BBCODE_RE = re.compile(r"\[/?[a-z0-9*]+(?:=[^\]]*)?\]", re.IGNORECASE)
_URL_RE = re.compile(r"https?://|www\.", re.IGNORECASE)
_WORD_RE = re.compile(r"[a-z0-9]+")
_SENTENCE_END_RE = re.compile(r"(?<=[.!?…])\s+")
_REPEATED_CHAR_RE = re.compile(r"(.)\1{4,}")


def pick_excerpts(reviews: list[str], limit: int = EXCERPTS_PER_SIDE) -> list[str]:
    """Hasta `limit` frases cortas y limpias, en el orden recibido (de más a menos útil)."""
    excerpts: list[str] = []
    seen: set[str] = set()
    for review in reviews:
        text = clean_review(review)
        if not is_usable(text):
            continue
        excerpt = first_sentences(text)
        key = _normalize(excerpt)[:60]
        if len(excerpt) < _MIN_LENGTH or key in seen:
            continue
        seen.add(key)
        excerpts.append(excerpt)
        if len(excerpts) >= limit:
            break
    return excerpts


def clean_review(review: str) -> str:
    """Saca el formato BBCode de Steam ([b], [h1], [list]…) y junta los espacios."""
    return " ".join(_BBCODE_RE.sub(" ", review or "").split())


def is_usable(text: str) -> bool:
    """False para dibujos con caracteres, groserías, links, mayúsculas sostenidas o texto sin contenido."""
    if len(text) < _MIN_LENGTH or _URL_RE.search(text) or _REPEATED_CHAR_RE.search(text):
        return False
    visible = text.replace(" ", "")
    letters = [character for character in visible if character.isalpha()]
    # Dibujos ASCII, emojis en cadena o "10/10 ⣿⣿⣿": pocas letras sobre el total.
    if len(letters) / len(visible) < 0.75 or len(set(text.casefold())) < 15:
        return False
    # Gritos: casi todo en mayúsculas.
    if sum(character.isupper() for character in letters) / len(letters) > 0.5:
        return False
    return not contains_profanity(text)


def contains_profanity(text: str) -> bool:
    return any(word in _PROFANITY for word in _WORD_RE.findall(_normalize(text)))


def first_sentences(text: str, max_length: int = EXCERPT_MAX_LENGTH) -> str:
    """Primeras oraciones completas que entren en `max_length`; si la primera ya es más larga, se corta en una palabra."""
    excerpt = ""
    for sentence in _SENTENCE_END_RE.split(text):
        candidate = f"{excerpt} {sentence}".strip()
        if len(candidate) > max_length:
            break
        excerpt = candidate
    if not excerpt:
        excerpt = text[:max_length].rsplit(" ", 1)[0].rstrip(",;:") + "…"
    return excerpt


def _normalize(text: str) -> str:
    """Minúsculas y sin tildes, para comparar palabras ("estúpido" → "estupido")."""
    decomposed = unicodedata.normalize("NFKD", text.casefold())
    return "".join(character for character in decomposed if not unicodedata.combining(character))
