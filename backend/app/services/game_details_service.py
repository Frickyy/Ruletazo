"""Enriquecimiento de un juego: géneros/sinopsis/reseñas (Store API), tiempo estimado
para completarlo (HowLongToBeat) y dificultad de logros (Steam Web API).

Se cachea por appid con un TTL largo porque, a diferencia de la biblioteca de un
usuario, esta información casi no cambia de un día para el otro.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.game import CachedGameDetails
from app.services import hltb_client
from app.services.steam_client import SteamClient
from app.services.store_client import SteamStoreClient

logger = logging.getLogger(__name__)

STORE_METADATA_VERSION = 5
# Subir este número fuerza a volver a pedir "lo bueno / lo malo" de las reseñas.
REVIEWS_VERSION = 1
# Subir este número fuerza a volver a buscar en HowLongToBeat los juegos que no tuvieron resultado.
HLTB_VERSION = 1

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
    return details.store_metadata_version >= STORE_METADATA_VERSION


def has_review_highlights(details: CachedGameDetails) -> bool:
    """True si ya se buscaron "lo bueno / lo malo" con la versión actual (aunque Steam no haya tenido)."""
    return (details.reviews_version or 0) >= REVIEWS_VERSION


def has_hltb_lookup(details: CachedGameDetails) -> bool:
    """True si ya se buscó en HLTB, haya tenido resultado o no.

    Antes se exigía tener horas: un juego que no está en HLTB volvía a pedir Store, reseñas,
    logros y HLTB cada vez que salía en la ruleta.
    """
    has_result = details.hltb_main_hours is not None or details.hltb_completionist_hours is not None
    return has_result or (details.hltb_version or 0) >= HLTB_VERSION


def has_rich_content(details: CachedGameDetails) -> bool:
    """A favorite should not be considered enriched while its synopsis is still empty."""
    return bool(details.short_description or details.review_score_desc or details.featured_reviews)


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
    """Devuelve los detalles cacheados de `appid` si están frescos; si no, los vuelve a pedir."""
    cached = get_cached_details(db, appid)
    if (
        cached is not None
        and is_fresh(cached)
        and has_store_metadata(cached)
        and has_hltb_lookup(cached)
        and has_review_highlights(cached)
    ):
        return cached

    logger.info("Enriqueciendo detalles de '%s' (appid %s)", name, appid)
    (store_details, reviews, highlights), achievements, hltb = await asyncio.gather(
        _fetch_store_data(appid),
        _fetch_achievements(appid),
        hltb_client.get_completion_times(name),
    )

    if cached is None:
        cached = CachedGameDetails(appid=appid)
        db.add(cached)

    if store_details.get("store_available"):
        cached.genres = store_details["genres"] or cached.genres
        cached.short_description = store_details["short_description"] or cached.short_description
        cached.developer = store_details["developer"] or cached.developer
        cached.price_cents = store_details["price_cents"]
        cached.release_date = store_details["release_date"]
    if not store_details.get("fetch_failed"):
        cached.store_metadata_version = STORE_METADATA_VERSION
    if reviews["score_desc"] or reviews["total_reviews"] or reviews["featured_reviews"]:
        cached.review_score_desc = reviews["score_desc"]
        cached.review_total = reviews["total_reviews"]
        cached.review_positive = reviews["total_positive"]
        cached.featured_reviews = reviews["featured_reviews"]
    cached.review_pros = highlights["pros"]
    cached.review_cons = highlights["cons"]
    cached.reviews_version = REVIEWS_VERSION
    if not hltb.get("failed"):
        # Un error de red no borra las horas que ya había ni cuenta como "no está en HLTB".
        cached.hltb_main_hours = hltb["main_hours"]
        cached.hltb_completionist_hours = hltb["completionist_hours"]
        cached.hltb_version = HLTB_VERSION
    cached.achievement_total = achievements["total"]
    cached.achievement_avg_percent = achievements["average_percent"]
    cached.fetched_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(cached)
    return cached


async def _fetch_store_data(appid: int) -> list[dict]:
    async with SteamStoreClient() as client:
        return await asyncio.gather(
            client.get_app_details(appid),
            client.get_reviews(appid),
            client.get_review_highlights(appid),
        )


async def _fetch_achievements(appid: int) -> dict:
    async with SteamClient() as client:
        return await client.get_achievement_difficulty(appid)
