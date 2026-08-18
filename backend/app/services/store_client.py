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
        self._client = httpx.AsyncClient(base_url=STORE_API_BASE_URL, timeout=timeout)

    async def __aenter__(self) -> "SteamStoreClient":
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        await self._client.aclose()

    async def get_app_details(self, appid: int, language: str = "english") -> dict:
        """Devuelve metadatos de Store. Vacío si Steam no tiene ficha para el appid."""
        try:
            response = await self._client.get(
                "/api/appdetails",
                params={"appids": appid, "l": language, "cc": "us"},
            )
            response.raise_for_status()
        except httpx.HTTPError:
            return {"genres": [], "short_description": "", "price_cents": None, "release_date": "", "store_available": False}

        entry = response.json().get(str(appid), {})
        if not entry.get("success"):
            return {"genres": [], "short_description": "", "price_cents": None, "release_date": "", "store_available": False}

        data = entry.get("data", {})
        genres = normalize_genres([genre["description"] for genre in data.get("genres", [])])
        price_overview = data.get("price_overview") or {}
        app_type = data.get("type", "")
        release_date = data.get("release_date", {}).get("date", "")
        release_date = _normalize_release_date(release_date)
        return {
            "genres": genres,
            "short_description": data.get("short_description", ""),
            "price_cents": (
                price_overview.get("final")
                if not data.get("is_free") and app_type == "game"
                else 0 if data.get("is_free") and app_type == "game" else None
            ),
            "app_type": app_type,
            "release_date": release_date,
            "store_available": True,
        }

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
        featured = [r["review"].strip() for r in data.get("reviews", []) if r.get("review", "").strip()]
        return {
            "score_desc": _REVIEW_SCORE_TRANSLATIONS.get(score_desc_en, score_desc_en),
            "total_reviews": summary.get("total_reviews", 0),
            "total_positive": summary.get("total_positive", 0),
            "featured_reviews": featured[:num_reviews],
        }


def _normalize_release_date(value: str) -> str:
    """Converts Steam's English display date into ISO for reliable sorting."""
    for date_format in ("%b %d, %Y", "%d %b, %Y", "%b %Y", "%Y"):
        try:
            return datetime.strptime(value.strip(), date_format).date().isoformat()
        except ValueError:
            continue
    return ""
