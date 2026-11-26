"""Enriquecimiento de un juego: géneros/sinopsis/reseñas (Store API), tiempo estimado
para completarlo (IGDB) y dificultad de logros (Steam Web API).

Se cachea por appid con un TTL largo porque, a diferencia de la biblioteca de un
usuario, esta información casi no cambia de un día para el otro.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.game import CachedGameDetails
from app.services import igdb_client, store_browse, throttle
from app.services.steam_client import SteamClient
from app.services.store_client import SteamStoreClient

logger = logging.getLogger(__name__)

# 6: sinopsis y fechas en español, y marca de contenido para adultos. 7: URL de la portada.
# 8: datos de IStoreBrowseService (de a 50 juegos), géneros por etiquetas y categorías de jugadores.
# 9: marca de software (Soundpad, Wallpaper Engine…) para dejarlo fuera de la ruleta.
# 10: puntaje y total de reseñas desde IStoreBrowseService (el de /appreviews era parcial y dejó de responder).
STORE_METADATA_VERSION = 10
# Subir este número fuerza a volver a pedir "lo bueno / lo malo" de las reseñas.
# 2: varias frases por lado, filtradas (review_digest), y los errores de Steam ya no se cachean.
REVIEWS_VERSION = 2
# Subir este número fuerza a volver a buscar en IGDB (por ejemplo, si cambia qué dato cuenta como creíble).
# 2: también el tiempo rápido (igdb_quick_hours), para descartar en la ficha horas de online.
IGDB_VERSION = 2

# Store API / reseñas / logros cambian poco: se reutilizan varios días antes de
# volver a golpear las 3 APIs externas para el mismo juego.
DETAILS_CACHE_TTL = timedelta(days=7)


def get_cached_details(db: Session, appid: int) -> CachedGameDetails | None:
    return db.get(CachedGameDetails, appid)


def is_fresh(details: CachedGameDetails) -> bool:
    fetched_at = details.fetched_at
    if fetched_at.tzinfo is None:
        fetched_at = fetched_at.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - fetched_at < DETAILS_CACHE_TTL


def has_store_metadata(details: CachedGameDetails) -> bool:
    """Old cache rows lack price/release metadata and must be refreshed from Store API."""
    return (details.store_metadata_version or 0) >= STORE_METADATA_VERSION


def has_review_highlights(details: CachedGameDetails) -> bool:
    """True si ya se buscaron "lo bueno / lo malo" con la versión actual (aunque Steam no haya tenido)."""
    return (details.reviews_version or 0) >= REVIEWS_VERSION


def has_igdb_lookup(details: CachedGameDetails) -> bool:
    """True si ya se buscó en IGDB con la versión actual, haya tenido dato o no."""
    return (details.igdb_version or 0) >= IGDB_VERSION


def apply_igdb(cached: CachedGameDetails, found: dict) -> None:
    """Guarda lo que devolvió igdb_client.get_times para este juego (horas None = sin dato creíble)."""
    cached.igdb_hours = found["hours"]
    cached.igdb_quick_hours = found.get("quick_hours")
    cached.igdb_samples = found["samples"]
    cached.igdb_url = found["url"]
    cached.igdb_version = IGDB_VERSION


# "Lo bueno" y "lo malo" se guardan como varias frases en una columna de texto, una por línea.
def join_excerpts(excerpts: list[str]) -> str:
    return "\n".join(excerpts)


def split_excerpts(text: str | None) -> list[str]:
    return [line for line in (text or "").split("\n") if line.strip()]


def has_rich_content(details: CachedGameDetails) -> bool:
    """A favorite should not be considered enriched while its synopsis is still empty."""
    return bool(details.short_description or details.review_score_desc or details.review_pros)


def difficulty_label(details: CachedGameDetails) -> str:
    """Traduce el % promedio de logros desbloqueados a una etiqueta legible."""
    if details.achievement_total == 0 or details.achievement_avg_percent is None:
        return "Sin logros"
    if details.achievement_avg_percent >= 50:
        return "Fácil"
    if details.achievement_avg_percent >= 20:
        return "Media"
    return "Difícil"


async def get_or_fetch_details(db: Session, appid: int, name: str) -> CachedGameDetails:
    """Devuelve los detalles de `appid`, pidiendo solo lo que falta o venció.

    Antes, si faltaba una sola parte (por ejemplo las reseñas, mientras Steam las tenía
    bloqueadas) se volvía a pedir todo: tienda, duración y logros, y cada giro tardaba
    varios segundos. Ahora se piden solo las partes que hacen falta. Las frases de las reseñas
    se piden solo si están prendidas (REVIEW_HIGHLIGHTS_ENABLED) y no mientras ese servicio está
    en pausa por rate limit (ver throttle.py).
    """
    cached = get_cached_details(db, appid)
    expired = cached is None or not is_fresh(cached)
    needs_store = expired or not has_store_metadata(cached)
    needs_igdb = (expired or not has_igdb_lookup(cached)) and igdb_client.enabled() and not throttle.is_cooling_down("igdb")
    needs_reviews = (
        get_settings().review_highlights_enabled
        and (expired or not has_review_highlights(cached))
        and not throttle.is_cooling_down("reviews")
    )
    needs_achievements = expired
    if not (needs_store or needs_igdb or needs_reviews or needs_achievements):
        return cached

    logger.info("Enriqueciendo detalles de '%s' (appid %s)", name, appid)
    store_details, reviews, achievements, igdb = await asyncio.gather(
        _fetch_app_details(appid) if needs_store else _skip(),
        _fetch_reviews(appid) if needs_reviews else _skip(),
        _fetch_achievements(appid) if needs_achievements else _skip(),
        igdb_client.get_times([appid]) if needs_igdb else _skip(),
    )

    if cached is None:
        cached = CachedGameDetails(appid=appid)
        db.add(cached)

    if store_details is not None:
        apply_store_details(cached, store_details)
    if reviews is not None and not reviews["failed"]:
        # De /appreviews solo se usan las frases: el puntaje y el total vienen con los datos de
        # la tienda (apply_store_details), porque el resumen de /appreviews cuenta una parte.
        # Si Steam no respondió (rate limit) se conserva lo que había y se reintenta la próxima vez.
        cached.featured_reviews = []
        cached.review_pros = join_excerpts(reviews["good"])
        cached.review_cons = join_excerpts(reviews["bad"])
        cached.reviews_version = REVIEWS_VERSION
    if igdb is not None:
        # None es que IGDB no respondió: se conserva lo que había y se reintenta la próxima vez.
        apply_igdb(cached, igdb[appid])
    if achievements is not None:
        cached.achievement_total = achievements["total"]
        cached.achievement_avg_percent = achievements["average_percent"]
    if expired:
        # La fecha marca la última actualización completa: completar una parte suelta no la renueva.
        cached.fetched_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(cached)
    return cached


async def _skip() -> None:
    return None


async def _fetch_app_details(appid: int) -> dict:
    return (await store_browse.get_items([appid]))[appid]


def apply_store_details(cached: CachedGameDetails, store_details: dict) -> None:
    """Copia los datos de la tienda a la caché. Una falla de red no toca nada (se reintenta);
    un juego que la tienda ya no tiene se marca como revisado para no pedirlo de nuevo."""
    if store_details.get("fetch_failed"):
        return
    if store_details.get("store_available"):
        cached.genres = store_details["genres"] or cached.genres or []
        cached.short_description = store_details["short_description"] or cached.short_description or ""
        cached.developer = store_details["developer"] or cached.developer or ""
        cached.price_cents = store_details["price_cents"]
        cached.release_date = store_details["release_date"]
        cached.is_adult = store_details["is_adult"]
        cached.is_software = store_details.get("is_software", False)
        cached.header_image = store_details["header_image"] or cached.header_image or ""
        cached.player_categories = store_details.get("player_categories", [])
        cached.review_score_desc = store_details.get("review_score_desc", "")
        cached.review_total = store_details.get("review_total", 0)
        cached.review_positive = store_details.get("review_positive", 0)
    cached.store_metadata_version = STORE_METADATA_VERSION


async def _fetch_reviews(appid: int) -> dict:
    async with SteamStoreClient() as client:
        return await client.get_review_digest(appid)


async def _fetch_achievements(appid: int) -> dict:
    async with SteamClient() as client:
        return await client.get_achievement_difficulty(appid)
