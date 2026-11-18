import asyncio
import logging
import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.game import CachedGameDetails, CachedLibraryEntry
from app.schemas.game import Game
from app.services import favorites_service, game_details_service
from app.services.steam_client import SteamClient
from app.services.store_client import SteamStoreClient, normalize_genres

logger = logging.getLogger(__name__)

# Tiempo que se reutiliza la biblioteca cacheada antes de volver a pedirla a Steam.
LIBRARY_CACHE_TTL = timedelta(hours=1)

# Cuántos juegos sin clasificar se enriquecen por cada llamada a classify_library_batch.
# La Store API de Steam no tiene un límite documentado, pero es prudente ir de a poco.
_CLASSIFY_DELAY_SECONDS = 1.0

STEAM_HEADER_IMAGE_URL = "https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/header.jpg"


async def resolve_steam_id(identifier: str) -> str:
    """Resuelve un identificador (SteamID64, vanity URL o link de perfil) a un SteamID64."""
    async with SteamClient() as client:
        return await client.resolve_steam_id(identifier)


async def get_library(db: Session, identifier: str) -> list[Game]:
    """Devuelve la biblioteca base de un usuario de Steam, usando caché SQL para no abusar de la Steam API."""
    async with SteamClient() as client:
        steam_id = await client.resolve_steam_id(identifier)
        cached_entries = _get_cached_entries(db, steam_id)

        if not cached_entries or not _is_cache_fresh(cached_entries[0].fetched_at):
            logger.info("Refrescando biblioteca de %s desde la Steam API", steam_id)
            games_raw = await client.get_owned_games(steam_id)
            _replace_cache(db, steam_id, games_raw)
            cached_entries = _get_cached_entries(db, steam_id)
        else:
            logger.info("Usando biblioteca cacheada de %s (%d juegos)", steam_id, len(cached_entries))

    return [_to_schema(entry) for entry in cached_entries]


async def get_filtered_library(
    db: Session,
    identifier: str,
    friend_identifier: str | None,
    collection: str,
    genre: str | None,
    search: str | None = None,
    sort_by: str = "name",
    sort_direction: str = "asc",
    playtime_filter: str = "all",
) -> list[Game]:
    """Biblioteca (combinada con la de un familiar si se pasa `friend_identifier`) + favoritos
    y detalles ya cacheados, con el filtro de colección/género aplicado."""
    games = await get_library(db, identifier)
    for game in games:
        game.source = "you"

    if friend_identifier:
        friend_identifiers = [identifier.strip() for identifier in friend_identifier.split(",") if identifier.strip()]
        for current_identifier in friend_identifiers[:5]:
            friend_games = await get_library(db, current_identifier)
            for game in friend_games:
                game.source = "friend"
            games = _merge_union(games, friend_games)

    steam_id = await resolve_steam_id(identifier)
    _attach_favorites_and_details(db, games, steam_id)

    if collection == "favorites":
        games = [game for game in games if game.is_favorite]
    if genre:
        games = [game for game in games if genre in game.genres]
    if search:
        search_value = search.casefold().strip()
        games = [game for game in games if search_value in game.name.casefold()]
    if playtime_filter == "zero":
        games = [game for game in games if game.playtime_forever_minutes == 0]
    elif playtime_filter == "under2":
        games = [game for game in games if game.playtime_forever_minutes < 120]

    if sort_by in {"price", "release_date"}:
        await _ensure_store_metadata(db, games)
        _attach_favorites_and_details(db, games, steam_id)

    reverse = sort_direction == "desc"
    if sort_by == "price":
        known = [game for game in games if game.price_cents is not None]
        unknown = [game for game in games if game.price_cents is None]
        known.sort(key=lambda game: (game.price_cents, game.name.casefold()), reverse=reverse)
        games = known + unknown
    elif sort_by == "release_date":
        known = [game for game in games if game.release_date]
        unknown = [game for game in games if not game.release_date]
        known.sort(key=lambda game: (game.release_date, game.name.casefold()), reverse=reverse)
        games = known + unknown
    else:
        games.sort(key=lambda game: game.name.casefold(), reverse=reverse)

    return games


async def get_random_from_library(
    db: Session,
    identifier: str,
    friend_identifier: str | None,
    collection: str,
    genre: str | None,
    search: str | None = None,
    sort_by: str = "name",
    sort_direction: str = "asc",
    playtime_filter: str = "all",
) -> Game | None:
    """Elige un juego al azar del pool filtrado y lo enriquece (Store/HLTB/logros) al toque."""
    games = await get_filtered_library(
        db, identifier, friend_identifier, collection, genre, search, sort_by, sort_direction, playtime_filter
    )
    if not games:
        return None

    chosen = random.choice(games)
    details = await game_details_service.get_or_fetch_details(db, chosen.appid, chosen.name)
    _apply_cached_details(chosen, details)
    return chosen


async def get_classification_status(db: Session, identifier: str) -> dict:
    """Cuántos juegos de la biblioteca ya tienen detalles frescos vs. el total."""
    steam_id = await resolve_steam_id(identifier)
    appids = [entry.appid for entry in _get_cached_entries(db, steam_id)]
    details_map = _get_cached_details_map(db, appids)
    classified = sum(
        1
        for appid in appids
        if appid in details_map
        and game_details_service.is_fresh(details_map[appid])
        and game_details_service.has_store_metadata(details_map[appid])
    )
    return {"classified": classified, "total": len(appids)}


async def classify_library_batch(db: Session, identifier: str, limit: int) -> dict:
    """Enriquece hasta `limit` juegos de la biblioteca que todavía no tengan detalles frescos.

    Steam no documenta un límite de rate para su Store API, así que esto avanza de a poco
    (con una pequeña pausa entre juegos) y se llama repetidas veces desde el frontend hasta
    que `remaining` llegue a 0, en vez de intentar clasificar toda la biblioteca de una vez.
    """
    steam_id = await resolve_steam_id(identifier)
    entries = _get_cached_entries(db, steam_id)
    details_map = _get_cached_details_map(db, [entry.appid for entry in entries])

    pending = [
        entry
        for entry in entries
        if entry.appid not in details_map
        or not game_details_service.is_fresh(details_map[entry.appid])
        or not game_details_service.has_store_metadata(details_map[entry.appid])
    ]
    to_process = pending[:limit]

    for index, entry in enumerate(to_process):
        await game_details_service.get_or_fetch_details(db, entry.appid, entry.name)
        if index < len(to_process) - 1:
            await asyncio.sleep(_CLASSIFY_DELAY_SECONDS)

    return {
        "processed": len(to_process),
        "remaining": len(pending) - len(to_process),
        "total": len(entries),
    }


def _merge_union(primary: list[Game], friend: list[Game]) -> list[Game]:
    by_appid: dict[int, Game] = {game.appid: game for game in primary}
    for friend_game in friend:
        if friend_game.appid in by_appid:
            by_appid[friend_game.appid].source = "both"
        else:
            by_appid[friend_game.appid] = friend_game
    return list(by_appid.values())


def _attach_favorites_and_details(db: Session, games: list[Game], steam_id: str) -> None:
    favorite_appids = favorites_service.get_favorite_appids(db, steam_id)
    details_map = _get_cached_details_map(db, [game.appid for game in games])

    for game in games:
        game.is_favorite = game.appid in favorite_appids
        details = details_map.get(game.appid)
        if details is not None:
            _apply_cached_details(game, details)


async def _ensure_store_metadata(db: Session, games: list[Game]) -> None:
    """Refresh missing Store fields in bounded parallel requests before price/date sorting."""
    details_map = _get_cached_details_map(db, [game.appid for game in games])
    pending = [
        game for game in games
        if game.appid not in details_map or not game_details_service.has_store_metadata(details_map[game.appid])
    ]
    if not pending:
        return

    async with SteamStoreClient() as client:
        results = []
        for offset in range(0, len(pending), 50):
            batch = pending[offset : offset + 50]
            details_by_appid = await client.get_app_details_batch([game.appid for game in batch])
            results.extend((game, details_by_appid.get(game.appid, {})) for game in batch)
    for game, store_details in results:
        details = details_map.get(game.appid)
        if details is None:
            details = CachedGameDetails(appid=game.appid)
            db.add(details)
        details.genres = normalize_genres(store_details["genres"]) or details.genres
        details.short_description = store_details["short_description"] or details.short_description
        details.developer = store_details["developer"] or details.developer
        details.price_cents = store_details["price_cents"]
        details.release_date = store_details["release_date"]
        details.store_metadata_version = game_details_service.STORE_METADATA_VERSION
        details.fetched_at = datetime.now(timezone.utc)
    db.commit()


def _apply_cached_details(game: Game, details: CachedGameDetails) -> None:
    game.genres = normalize_genres(details.genres)
    game.short_description = details.short_description
    game.developer = details.developer
    game.price_cents = details.price_cents
    game.release_date = details.release_date
    game.review_score_desc = details.review_score_desc
    game.review_total = details.review_total
    game.featured_reviews = details.featured_reviews
    game.hltb_main_hours = details.hltb_main_hours
    game.hltb_completionist_hours = details.hltb_completionist_hours
    game.achievement_difficulty = game_details_service.difficulty_label(details)


def _get_cached_details_map(db: Session, appids: list[int]) -> dict[int, CachedGameDetails]:
    if not appids:
        return {}
    stmt = select(CachedGameDetails).where(CachedGameDetails.appid.in_(appids))
    return {details.appid: details for details in db.execute(stmt).scalars().all()}


def _get_cached_entries(db: Session, steam_id: str) -> list[CachedLibraryEntry]:
    stmt = select(CachedLibraryEntry).where(CachedLibraryEntry.steam_id == steam_id)
    return list(db.execute(stmt).scalars().all())


def _is_cache_fresh(fetched_at: datetime) -> bool:
    if fetched_at.tzinfo is None:
        fetched_at = fetched_at.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - fetched_at < LIBRARY_CACHE_TTL


def _replace_cache(db: Session, steam_id: str, games_raw: list[dict]) -> None:
    db.execute(delete(CachedLibraryEntry).where(CachedLibraryEntry.steam_id == steam_id))
    now = datetime.now(timezone.utc)
    for game in games_raw:
        db.add(
            CachedLibraryEntry(
                steam_id=steam_id,
                appid=game["appid"],
                name=game.get("name", f"App {game['appid']}"),
                playtime_forever_minutes=game.get("playtime_forever", 0),
                fetched_at=now,
            )
        )
    db.commit()


def _to_schema(entry: CachedLibraryEntry) -> Game:
    return Game(
        appid=entry.appid,
        name=entry.name,
        header_image=STEAM_HEADER_IMAGE_URL.format(appid=entry.appid),
        # genres y short_description se completan en _attach_favorites_and_details si ya están cacheados.
        genres=[],
        short_description="",
        playtime_forever_minutes=entry.playtime_forever_minutes,
    )
