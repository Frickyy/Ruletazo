"""Páginas "¿Cuánto dura…?": una por juego popular, para que quien busca en Google cuánto dura un
juego llegue a Ruletazo (ver routers/duration_pages.py, que las dibuja).

Qué juegos tienen página: los más jugados y los más vendidos de la semana en Steam, los populares
que ya aparecieron en bibliotecas cargadas en la página, y los que ya tenían página. De esos,
solo los que tienen un dato creíble en IGDB (ver igdb_client), no son +18 ni programas y tienen
reseñas suficientes. Se actualiza solo una vez por día (refresh_loop).
"""

import asyncio
import json
import logging
import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.game import CachedGameDetails, DurationPage
from app.services import game_details_service, igdb_client, store_browse

logger = logging.getLogger(__name__)

MOST_PLAYED_URL = "https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/"
TOP_SELLERS_URL = "https://api.steampowered.com/IStoreTopSellersService/GetWeeklyTopSellers/v1/"
_HEADERS = {"User-Agent": "Ruletazo/1.0 (+https://ruletazo.app)"}
# Popular entre los juegos que ya conoce la página (los de las bibliotecas cargadas).
POPULAR_REVIEWS = 2000
# Mínimo de reseñas en Steam para tener página (los más vendidos nuevos pueden tener pocas).
MIN_PAGE_REVIEWS = 500
STARTUP_DELAY_SECONDS = 120
REFRESH_INTERVAL_SECONDS = 24 * 60 * 60


@dataclass
class PageEntry:
    """Lo que hace falta para dibujar una página o un link a ella."""

    page: DurationPage
    details: CachedGameDetails

    @property
    def hours(self) -> float:
        return self.details.igdb_hours


def slugify(name: str) -> str:
    """ "Baldur's Gate 3" → "baldurs-gate-3". Sin letras latinas (un nombre en japonés) queda vacío."""
    # ™ y ® se descompondrían en "tm" y "r" ("elden-ringtm").
    text = unicodedata.normalize("NFKD", re.sub(r"[™®©]", "", name)).encode("ascii", "ignore").decode().lower()
    text = re.sub(r"['’`´]", "", text)
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")[:100]


def unique_slug(name: str, appid: int, used: dict[str, int]) -> str:
    """La dirección del juego, sin chocar con la de otro (si choca, o el nombre no sirve, se suma el appid)."""
    base = slugify(name)
    if base and used.get(base, appid) == appid:
        return base
    return f"{base}-{appid}" if base else str(appid)


def qualifies(details: CachedGameDetails | None) -> bool:
    return (
        details is not None
        and details.igdb_hours is not None
        and not details.is_adult
        and not details.is_software
        and (details.review_total or 0) >= MIN_PAGE_REVIEWS
    )


async def popular_appids(db: Session) -> list[int]:
    """Los candidatos, en orden y sin repetir."""
    found: list[int] = []
    top_sellers = {"input_json": json.dumps({"country_code": "US", "context": {"language": "english", "country_code": "US"}, "page_start": 0, "page_count": 100})}
    async with httpx.AsyncClient(timeout=20, headers=_HEADERS) as client:
        found += await _ranked(client, MOST_PLAYED_URL, None)
        found += await _ranked(client, TOP_SELLERS_URL, top_sellers)
    found += db.scalars(select(CachedGameDetails.appid).where(CachedGameDetails.review_total >= POPULAR_REVIEWS)).all()
    found += db.scalars(select(DurationPage.appid)).all()
    return list(dict.fromkeys(found))


async def _ranked(client: httpx.AsyncClient, url: str, params: dict | None) -> list[int]:
    try:
        response = await client.get(url, params=params)
        response.raise_for_status()
        ranks = response.json().get("response", {}).get("ranks", [])
        return [int(rank["appid"]) for rank in ranks if rank.get("appid")]
    except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError):
        logger.warning("No se pudo leer la lista de Steam %s", url, exc_info=True)
        return []


async def refresh(db: Session) -> dict:
    """Pide lo que falte (tienda, IGDB) para los candidatos y crea, actualiza o saca páginas."""
    appids = await popular_appids(db)
    details = {row.appid: row for row in db.scalars(select(CachedGameDetails).where(CachedGameDetails.appid.in_(appids)))}
    pages = {page.appid: page for page in db.scalars(select(DurationPage))}

    # Tienda: el nombre (para la dirección) y los datos de la ficha, para los nuevos o con datos viejos.
    names: dict[int, str] = {}
    need_store = [
        appid for appid in appids
        if appid not in pages or appid not in details or not game_details_service.has_store_metadata(details[appid])
    ]
    if need_store:
        for appid, data in (await store_browse.get_items(need_store)).items():
            if data.get("fetch_failed"):
                continue
            row = details.get(appid)
            if row is None:
                # Con fecha vieja: la primera vez que salga en la ruleta se completa todo lo demás.
                aged = datetime.now(timezone.utc) - game_details_service.DETAILS_CACHE_TTL
                row = CachedGameDetails(appid=appid, fetched_at=aged)
                db.add(row)
                details[appid] = row
            game_details_service.apply_store_details(row, data)
            if data.get("name"):
                names[appid] = data["name"].strip()

    # IGDB: todos de una (de a 200 por pedido); también trae los tiempos rápido y al 100 %.
    times = await igdb_client.get_times([appid for appid in appids if appid in details]) or {}
    for appid, found in times.items():
        game_details_service.apply_igdb(details[appid], found)

    used = {page.slug: page.appid for page in pages.values()}
    now = datetime.now(timezone.utc)
    created = removed = 0
    for appid in appids:
        row, page = details.get(appid), pages.get(appid)
        if not qualifies(row):
            # Solo se saca si IGDB respondió: una falla de red no borra páginas.
            if page is not None and appid in times:
                db.delete(page)
                removed += 1
            continue
        if page is None:
            name = names.get(appid)
            if not name:
                continue
            page = DurationPage(appid=appid, slug=unique_slug(name, appid, used), name=name)
            db.add(page)
            used[page.slug] = appid
            created += 1
        elif names.get(appid):
            page.name = names[appid]  # la dirección no cambia aunque cambie el nombre
        if appid in times:
            page.quick_hours = times[appid]["quick_hours"]
            page.full_hours = times[appid]["full_hours"]
        page.updated_at = now
    db.commit()
    total = len(entries(db))
    return {"candidates": len(appids), "pages": total, "created": created, "removed": removed}


def entries(db: Session) -> list[PageEntry]:
    """Las páginas que se muestran, de la más corta a la más larga."""
    rows = db.execute(
        select(DurationPage, CachedGameDetails)
        .join(CachedGameDetails, CachedGameDetails.appid == DurationPage.appid)
        .where(CachedGameDetails.igdb_hours.is_not(None))
    ).all()
    return sorted((PageEntry(page, details) for page, details in rows), key=lambda entry: (entry.hours, entry.page.name.casefold()))


def entry_by_slug(db: Session, slug: str) -> PageEntry | None:
    row = db.execute(
        select(DurationPage, CachedGameDetails)
        .join(CachedGameDetails, CachedGameDetails.appid == DurationPage.appid)
        .where(DurationPage.slug == slug, CachedGameDetails.igdb_hours.is_not(None))
    ).first()
    return PageEntry(*row) if row else None


def related(all_entries: list[PageEntry], entry: PageEntry, count: int = 6) -> list[PageEntry]:
    """Otros juegos que duran parecido (los más cercanos en horas)."""
    others = [other for other in all_entries if other.page.appid != entry.page.appid]
    return sorted(others, key=lambda other: (abs(other.hours - entry.hours), other.page.name.casefold()))[:count]


async def refresh_loop(session_factory) -> None:
    """Una vez por día, en segundo plano (solo en producción y con claves de IGDB; ver main.py)."""
    await asyncio.sleep(STARTUP_DELAY_SECONDS)
    while True:
        try:
            with session_factory() as db:
                summary = await refresh(db)
            logger.info("Páginas ¿Cuánto dura?: %s", summary)
        except Exception:
            logger.exception("No se pudieron actualizar las páginas ¿Cuánto dura?")
        await asyncio.sleep(REFRESH_INTERVAL_SECONDS)
