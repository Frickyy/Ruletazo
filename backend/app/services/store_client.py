"""Cliente para los endpoints públicos de la Store de Steam (no requieren API key)."""

import asyncio
import re
from datetime import datetime

import httpx

from app.services import review_digest

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
        """Metadatos de varios juegos.

        /api/appdetails responde 400 si se le pasan varios appids juntos (solo lo acepta con
        `filters=price_overview`), así que se pide de a uno, con pocos pedidos en paralelo para
        no chocar con el límite de la Store.
        """
        semaphore = asyncio.Semaphore(_STORE_CONCURRENCY)

        async def fetch(appid: int) -> tuple[int, dict]:
            async with semaphore:
                return appid, await self._fetch_app_details(appid, language)

        return dict(await asyncio.gather(*(fetch(appid) for appid in appids)))

    async def _fetch_app_details(self, appid: int, language: str) -> dict:
        try:
            response = await self._client.get("/api/appdetails", params={"appids": appid, "l": language, "cc": "us"})
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError):
            # Falla de red o rate limit: no es lo mismo que "Steam no tiene ficha", no hay que cachearlo.
            return {**_empty_app_details(), "fetch_failed": True}

        entry = (payload or {}).get(str(appid)) or {}
        if not entry.get("success"):
            return _empty_app_details()

        data = entry.get("data", {})
        price_overview = data.get("price_overview") or {}
        app_type = data.get("type", "")
        is_game = app_type == "game"
        if not is_game:
            price_cents = None
        elif data.get("is_free"):
            price_cents = 0
        else:
            price_cents = price_overview.get("final")
        return {
            "name": data.get("name", ""),
            "genres": normalize_genres([genre["description"] for genre in data.get("genres", [])]),
            "short_description": data.get("short_description", ""),
            "developer": ", ".join(data.get("developers", [])),
            "price_cents": price_cents,
            "app_type": app_type,
            "release_date": _normalize_release_date(data.get("release_date", {}).get("date", "")),
            "store_available": True,
        }

    async def get_review_digest(self, appid: int) -> dict:
        """Puntaje de la comunidad + "lo bueno" y "lo malo" en frases cortas (ver review_digest).

        Son dos pedidos: las reseñas más útiles en español (con ambos tipos mezclados, separadas
        por `voted_up`) y las de todos los idiomas, que dan el puntaje global y completan si en
        español no alcanza. Antes eran cinco pedidos por juego y Steam empezaba a redirigir a la
        portada (rate limit); ese error se guardaba como "sin reseñas" durante días.

        Devuelve `failed=True` si Steam no respondió bien, para no cachear un resultado vacío.
        """
        spanish = await self._fetch_reviews(appid, language="spanish", num_per_page=100)
        everyone = await self._fetch_reviews(appid, language="all", num_per_page=60)
        if everyone is None:
            return {"failed": True}

        summary = everyone.get("query_summary", {})
        score_desc_en = summary.get("review_score_desc", "")
        good, bad = [], []
        for payload in (spanish, everyone):
            if payload is None:
                continue
            reviews = payload.get("reviews", [])
            good += [review.get("review", "") for review in reviews if review.get("voted_up")]
            bad += [review.get("review", "") for review in reviews if not review.get("voted_up")]
        return {
            "failed": False,
            "score_desc": _REVIEW_SCORE_TRANSLATIONS.get(score_desc_en, score_desc_en),
            "total_reviews": summary.get("total_reviews", 0),
            "total_positive": summary.get("total_positive", 0),
            "good": review_digest.pick_excerpts(good),
            "bad": review_digest.pick_excerpts(bad),
        }

    async def _fetch_reviews(self, appid: int, language: str, num_per_page: int) -> dict | None:
        """Primera página de reseñas ordenadas por utilidad. None si Steam no respondió con JSON válido."""
        try:
            response = await self._client.get(
                f"/appreviews/{appid}",
                params={
                    "json": 1,
                    "filter": "all",
                    "language": language,
                    "review_type": "all",
                    "purchase_type": "all",
                    "num_per_page": num_per_page,
                },
            )
            # Con rate limit Steam responde 302 a la portada en vez de un error.
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError):
            return None
        return payload if payload.get("success") == 1 else None

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


# Pedidos simultáneos a /api/appdetails (la Store limita a ~200 cada 5 minutos por IP).
_STORE_CONCURRENCY = 4

# storesearch devuelve todo como "app", incluidas bandas sonoras y extras: se filtran por nombre.
_NON_GAME_NAME_RE = re.compile(
    r"\b(?:soundtrack|ost|original score|artbook|art book|wallpapers?|demo|playtest|dedicated server|sdk)\b",
    re.IGNORECASE,
)

def parse_search_results(payload: dict, limit: int = 10) -> list[dict]:
    """Convierte la respuesta de storesearch en [{appid, name, image}] (solo juegos, sin bandas sonoras ni extras)."""
    results = []
    for item in payload.get("items", []):
        if item.get("type") != "app" or not item.get("id"):
            continue
        name = item.get("name", "")
        if _NON_GAME_NAME_RE.search(name):
            continue
        appid = int(item["id"])
        # tiny_image trae la URL real del asset; header.jpg no existe para algunos juegos nuevos.
        image = item.get("tiny_image") or steam_header_image(appid)
        results.append({"appid": appid, "name": name, "image": image})
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
