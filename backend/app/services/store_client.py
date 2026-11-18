"""Cliente para los endpoints públicos de la Store de Steam (no requieren API key)."""

from datetime import datetime

import httpx

STORE_API_BASE_URL = "https://store.steampowered.com"

# query_summary.review_score_desc siempre viene en inglés, sin importar el `language`
# pedido (quirk conocido de la Store API); lo traducimos para que la ficha quede en español.
_REVIEW_SCORE_TRANSLATIONS = {
    "Overwhelmingly Positive": "Extremadamente positivas",
    "Very Positive": "Muy positivas",
    "Positive": "Positivas",
    "Mostly Positive": "Mayormente positivas",
    "Mixed": "Mixtas",
    "Mostly Negative": "Mayormente negativas",
    "Negative": "Negativas",
    "Very Negative": "Muy negativas",
    "Overwhelmingly Negative": "Extremadamente negativas",
    "No user reviews": "Sin reseñas de usuarios",
}

_GENRE_TRANSLATIONS = {
    "Action": "Acción",
    "Adventure": "Aventura",
    "Racing": "Carreras",
    "Sports": "Deportes",
    "Design & Illustration": "Diseño e ilustración",
    "Strategy": "Estrategia",
    "Massively Multiplayer": "Multijugador masivo",
    "RPG": "Rol",
    "Simulation": "Simuladores",
    "Violent": "Violencia",
    "Early Access": "Acceso anticipado",
    "Free To Play": "Free to Play",
    "Animation & Modeling": "Animación y modelado",
    "Audio Production": "Producción de audio",
    "Game Development": "Desarrollo de juegos",
    "Education": "Educación",
    "Photo Editing": "Edición de fotos",
    "Utilities": "Utilidades",
    "Nudity": "Desnudos",
    "Sexual Content": "Contenido sexual",
    "Gore": "Sangrientos",
}


def normalize_genres(genres: list[str]) -> list[str]:
    """Translate known Store labels and remove duplicates caused by mixed-language cache rows."""
    normalized = {_GENRE_TRANSLATIONS.get(genre, genre) for genre in genres if genre}
    return sorted(normalized, key=str.casefold)


class SteamStoreClient:
    """Cliente async para la Store API pública de Steam (appdetails, appreviews)."""

    def __init__(self, timeout: float = 10.0) -> None:
        self._client = httpx.AsyncClient(
            base_url=STORE_API_BASE_URL,
            timeout=timeout,
            headers={"User-Agent": "Steamzinho/1.0"},
        )

    async def __aenter__(self) -> "SteamStoreClient":
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        await self._client.aclose()

    async def get_app_details(self, appid: int, language: str = "english") -> dict:
        """Devuelve metadatos de Store. Vacío si Steam no tiene ficha para el appid."""
        details = await self.get_app_details_batch([appid], language)
        return details.get(appid, _empty_app_details())

    async def get_app_details_batch(self, appids: list[int], language: str = "english") -> dict[int, dict]:
        """Fetch up to 50 app details in one Store API request."""
        if not appids:
            return {}
        try:
            response = await self._client.get(
                "/api/appdetails",
                params={"appids": ",".join(str(appid) for appid in appids), "l": language, "cc": "us"},
            )
            response.raise_for_status()
        except httpx.HTTPError:
            return {appid: _empty_app_details() for appid in appids}

        result = {}
        for appid in appids:
            entry = response.json().get(str(appid), {})
            if not entry.get("success"):
                result[appid] = _empty_app_details()
                continue

            data = entry.get("data", {})
            genres = normalize_genres([genre["description"] for genre in data.get("genres", [])])
            price_overview = data.get("price_overview") or {}
            app_type = data.get("type", "")
            release_date = _normalize_release_date(data.get("release_date", {}).get("date", ""))
            result[appid] = {
                "name": data.get("name", ""),
                "genres": genres,
                "short_description": data.get("short_description", ""),
                "developer": ", ".join(data.get("developers", [])),
                "price_cents": (
                    price_overview.get("final")
                    if not data.get("is_free") and app_type == "game"
                    else 0 if data.get("is_free") and app_type == "game" else None
                ),
                "app_type": app_type,
                "release_date": release_date,
                "store_available": True,
            }
        return result

    async def get_reviews(self, appid: int, language: str = "spanish", num_reviews: int = 3) -> dict:
        """Devuelve el resumen de reseñas de Steam + hasta `num_reviews` reseñas de texto destacadas."""
        try:
            response = await self._client.get(
                f"/appreviews/{appid}",
                params={
                    "json": 1,
                    "filter": "recent",
                    "language": language,
                    "num_per_page": num_reviews,
                    "purchase_type": "all",
                },
            )
            response.raise_for_status()
        except httpx.HTTPError:
            return {"score_desc": "", "total_reviews": 0, "total_positive": 0, "featured_reviews": []}

        data = response.json()
        summary = data.get("query_summary", {})
        score_desc_en = summary.get("review_score_desc", "")
        featured = [
            review
            for review in (r.get("review", "").strip() for r in data.get("reviews", []))
            if _is_substantive_review(review)
        ]
        return {
            "score_desc": _REVIEW_SCORE_TRANSLATIONS.get(score_desc_en, score_desc_en),
            "total_reviews": summary.get("total_reviews", 0),
            "total_positive": summary.get("total_positive", 0),
            "featured_reviews": featured[:num_reviews],
        }


    async def get_review_highlights(self, appid: int) -> dict:
        """La reseña positiva y la negativa más votadas como útiles ("lo bueno" y "lo malo").

        Busca primero en español; si no hay una reseña con contenido, en cualquier idioma.
        """
        highlights = {}
        for review_type in ("positive", "negative"):
            text = ""
            for language in ("spanish", "all"):
                text = await self._most_helpful_review(appid, review_type, language)
                if text:
                    break
            highlights[review_type] = text
        return {"pros": highlights["positive"], "cons": highlights["negative"]}

    async def _most_helpful_review(self, appid: int, review_type: str, language: str) -> str:
        try:
            response = await self._client.get(
                f"/appreviews/{appid}",
                params={
                    "json": 1,
                    "filter": "all",
                    "review_type": review_type,
                    "language": language,
                    "num_per_page": 10,
                    "purchase_type": "all",
                },
            )
            response.raise_for_status()
        except httpx.HTTPError:
            return ""
        return pick_highlight([review.get("review", "") for review in response.json().get("reviews", [])])

    async def search_games(self, term: str, limit: int = 10) -> list[dict]:
        """Busca juegos en la tienda de Steam por nombre (para el buscador del foro)."""
        try:
            response = await self._client.get(
                "/api/storesearch/",
                params={"term": term, "l": "spanish", "cc": "us"},
            )
            response.raise_for_status()
        except httpx.HTTPError:
            return []
        return parse_search_results(response.json(), limit)


# Largo máximo guardado para "lo bueno" / "lo malo": la ficha muestra un extracto.
HIGHLIGHT_MAX_LENGTH = 600


def pick_highlight(reviews: list[str]) -> str:
    """Primera reseña con contenido real (descarta dibujos ASCII), recortada a HIGHLIGHT_MAX_LENGTH."""
    for review in reviews:
        text = " ".join(review.split())
        if _is_readable_highlight(text):
            if len(text) > HIGHLIGHT_MAX_LENGTH:
                text = text[:HIGHLIGHT_MAX_LENGTH].rsplit(" ", 1)[0] + "…"
            return text
    return ""


def parse_search_results(payload: dict, limit: int = 10) -> list[dict]:
    """Convierte la respuesta de storesearch en [{appid, name, image}] (solo juegos/apps)."""
    results = []
    for item in payload.get("items", []):
        if item.get("type") != "app" or not item.get("id"):
            continue
        appid = int(item["id"])
        results.append({"appid": appid, "name": item.get("name", ""), "image": steam_header_image(appid)})
        if len(results) >= limit:
            break
    return results


def steam_header_image(appid: int) -> str:
    return f"https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/header.jpg"


def _normalize_release_date(value: str) -> str:
    """Converts Steam's English display date into ISO for reliable sorting."""
    for date_format in ("%b %d, %Y", "%d %b, %Y", "%b %Y", "%Y"):
        try:
            return datetime.strptime(value.strip(), date_format).date().isoformat()
        except ValueError:
            continue
    return ""


def _empty_app_details() -> dict:
    return {
        "name": "",
        "genres": [],
        "short_description": "",
        "developer": "",
        "price_cents": None,
        "release_date": "",
        "store_available": False,
    }


def _is_substantive_review(review: str) -> bool:
    """Descarta reseñas cortas o dibujos ASCII aunque superen el mínimo de longitud."""
    if len(review) < 200:
        return False
    letters = sum(character.isalpha() for character in review)
    return letters >= 40 and len(set(review.casefold())) >= 12


def _is_readable_highlight(text: str) -> bool:
    """Más permisivo que _is_substantive_review (acepta reseñas cortas), pero exige texto real:
    al menos 60 caracteres y que la mitad sean letras (descarta dibujos con símbolos)."""
    visible = text.replace(" ", "")
    if len(text) < 60 or not visible:
        return False
    letters = sum(character.isalpha() for character in visible)
    return letters / len(visible) >= 0.5 and len(set(text.casefold())) >= 12
