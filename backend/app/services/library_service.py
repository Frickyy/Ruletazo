import logging
import random
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.game import CachedGameDetails, CachedLibraryEntry, GameState, UserGameProgress
from app.schemas.game import Game
from app.services import (
    favorites_service,
    duration_service,
    game_details_service,
    hidden_service,
    igdb_client,
    profile_service,
    store_browse,
    throttle,
)
from app.services.steam_client import SteamAPIError, SteamClient
from app.services.store_client import looks_adult_by_name, normalize_genres

logger = logging.getLogger(__name__)

# Tiempo que se reutiliza la biblioteca cacheada antes de volver a pedirla a Steam.
LIBRARY_CACHE_TTL = timedelta(hours=1)

# Juegos que fallaron en la segunda pasada (duración/logros) y cuándo, para no reintentarlos enseguida.
_enrich_failures: dict[tuple[str, int], float] = {}
_RETRY_FAILED_AFTER_SECONDS = 60 * 60

# Como mucho se combinan las bibliotecas de estos familiares.
MAX_FAMILY_MEMBERS = 5


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


# Quien llama desde código interno (tests, servicios) ve todo. Los endpoints pasan el SteamID
# de la sesión: los favoritos, ocultos, estados y progreso solo se muestran a su dueño.
ANY_VIEWER = object()


def _is_owner(steam_id: str, viewer_steam_id) -> bool:
    return viewer_steam_id is ANY_VIEWER or viewer_steam_id == steam_id


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
    viewer_steam_id=ANY_VIEWER,
) -> list[Game]:
    """Biblioteca (combinada con la de un familiar si se pasa `friend_identifier`) + favoritos
    y detalles ya cacheados, con el filtro de colección/género aplicado."""
    games = await get_library(db, identifier)
    for game in games:
        game.source = "you"

    for friend_games in await _family_libraries(db, friend_identifier):
        games = _merge_union(games, friend_games)

    steam_id = await resolve_steam_id(identifier)
    personal = _is_owner(steam_id, viewer_steam_id)
    _attach_favorites_and_details(db, games, steam_id, personal=personal)

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
        _attach_favorites_and_details(db, games, steam_id, personal=personal)

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
    viewer_steam_id=ANY_VIEWER,
) -> Game | None:
    """Elige un juego al azar del pool filtrado y lo enriquece (tienda, duración, logros) al toque."""
    games = await get_filtered_library(
        db, identifier, friend_identifier, collection, genre, search, sort_by, sort_direction, playtime_filter,
        viewer_steam_id=viewer_steam_id,
    )
    if not games:
        return None

    chosen = random.choice(games)
    details = await game_details_service.get_or_fetch_details(db, chosen.appid, chosen.name)
    apply_cached_details(chosen, details)
    return chosen


def _split_family_ids(friend_identifier: str | None) -> list[str]:
    if not friend_identifier:
        return []
    ids = [identifier.strip() for identifier in friend_identifier.split(",") if identifier.strip()]
    return ids[:MAX_FAMILY_MEMBERS]


async def _family_library(db: Session, identifier: str) -> list[Game]:
    """Biblioteca de un familiar. Si su perfil es privado o el ID está mal, se omite (con un aviso
    en el log) en vez de romper la biblioteca propia, que antes respondía 404/403 entera."""
    try:
        games = await get_library(db, identifier)
    except SteamAPIError as exc:
        logger.warning("Se omite la biblioteca familiar %r: %s", identifier, exc)
        return []
    for game in games:
        game.source = "friend"
    return games


async def _family_libraries(db: Session, friend_identifier: str | None) -> list[list[Game]]:
    return [await _family_library(db, identifier) for identifier in _split_family_ids(friend_identifier)]


def _is_classified(details: CachedGameDetails | None) -> bool:
    """Un juego cuenta como clasificado si ya tiene los metadatos actuales de la Store.

    No se exige que estén "frescos": los datos vencidos se refrescan solos cuando el juego
    sale en la ruleta (ver game_details_service.get_or_fetch_details). Si se exigiera,
    toda la biblioteca volvería a figurar como pendiente cada vez que vence el TTL.
    """
    return details is not None and game_details_service.has_store_metadata(details)


async def get_game_details(
    db: Session, identifier: str, friend_identifier: str | None, appid: int, viewer_steam_id=ANY_VIEWER
) -> Game | None:
    """Ficha completa de un juego de la biblioteca (propia o familiar), enriquecida al toque.

    La ruleta "en vivo" elige el juego en el navegador (el que frena en el rodillo) y pide
    su ficha con esto, en vez de que el backend elija uno al azar.
    """
    # Solo se busca ese appid: antes se armaba y ordenaba toda la biblioteca combinada
    # (con la de cada familiar) para quedarse con un juego.
    own = next((game for game in await get_library(db, identifier) if game.appid == appid), None)
    if own is not None:
        own.source = "you"
    chosen = own
    for friend_games in await _family_libraries(db, friend_identifier):
        friend_game = next((game for game in friend_games if game.appid == appid), None)
        if friend_game is None:
            continue
        if chosen is None:
            chosen = friend_game
        elif chosen.source == "you":
            chosen.source = "both"
    if chosen is None:
        return None

    steam_id = await resolve_steam_id(identifier)
    if _is_owner(steam_id, viewer_steam_id):
        chosen.is_favorite = appid in favorites_service.get_favorite_appids(db, steam_id)
        chosen.is_hidden = appid in hidden_service.get_hidden_appids(db, steam_id)
        chosen.state = get_states(db, steam_id).get(appid)
        _apply_progress(chosen, _get_progress_map(db, steam_id).get(appid))
    details = await game_details_service.get_or_fetch_details(db, chosen.appid, chosen.name)
    apply_cached_details(chosen, details)
    apply_durations(db, [chosen])
    return chosen


async def get_classification_status(db: Session, identifier: str) -> dict:
    """Sobre el total de la biblioteca: cuántos juegos ya tienen los datos de la tienda (primera
    pasada) y cuántos ya no necesitan la segunda (tu progreso de logros)."""
    steam_id = await resolve_steam_id(identifier)
    entries = _get_cached_entries(db, steam_id)
    details_map = _get_cached_details_map(db, [entry.appid for entry in entries])
    classified = sum(1 for entry in entries if _is_classified(details_map.get(entry.appid)))
    needs_progress = _progress_pending(db, steam_id)
    enriched = sum(1 for entry in entries if not needs_progress(entry))
    return {"classified": classified, "total": len(entries), "enriched": enriched}


async def classify_library_batch(db: Session, identifier: str, limit: int) -> dict:
    """Completa los datos de la tienda de hasta `limit` juegos pendientes.

    Usa IStoreBrowseService, que trae 50 juegos por pedido: una biblioteca de mil juegos se
    clasifica en unos segundos (antes era un pedido por juego, con pausas, durante más de una hora).
    Se llama repetidas veces desde el frontend hasta que `remaining` llegue a 0.
    """
    steam_id = await resolve_steam_id(identifier)
    entries = _get_cached_entries(db, steam_id)
    details_map = _get_cached_details_map(db, [entry.appid for entry in entries])

    pending = [entry for entry in entries if not _is_classified(details_map.get(entry.appid))]
    to_process = pending[:limit]
    store_data = await store_browse.get_items([entry.appid for entry in to_process])
    failed = 0
    for entry in to_process:
        data = store_data[entry.appid]
        if data.get("fetch_failed"):
            failed += 1
            continue
        details = details_map.get(entry.appid)
        if details is None:
            details = CachedGameDetails(appid=entry.appid, fetched_at=datetime.now(timezone.utc) - game_details_service.DETAILS_CACHE_TTL)
            db.add(details)
        game_details_service.apply_store_details(details, data)
    db.commit()

    return {
        "processed": len(to_process) - failed,
        "remaining": len(pending) - len(to_process) + failed,
        "total": len(entries),
        # Si Steam no respondió, el frontend deja de insistir hasta la próxima vez.
        "failed": failed > 0,
    }


def _progress_pending(db: Session, steam_id: str):
    """Para qué juegos falta pedir tu progreso de logros. Solo si lo activaste en tu perfil (Steam
    pide consultar datos de un usuario solo cuando él lo pide) y solo los que jugaste: sin horas
    no hay logros desbloqueados que contar."""
    track_achievements = profile_service.tracks_achievements(db, steam_id)
    progress_map = _get_progress_map(db, steam_id)

    def needs_progress(entry) -> bool:
        return track_achievements and entry.playtime_forever_minutes > 0 and entry.appid not in progress_map

    return needs_progress


async def _lookup_igdb_durations(db: Session, entries) -> int:
    """La duración de IGDB de todos los juegos de la biblioteca que todavía no la buscaron, de a
    200 por pedido: una biblioteca de mil juegos se completa en unos segundos (antes se buscaba
    solo al abrir la ficha de cada juego, y la mayoría quedaba sin duración). Devuelve cuántos."""
    if not igdb_client.enabled() or throttle.is_cooling_down("igdb"):
        return 0
    details_map = _get_cached_details_map(db, [entry.appid for entry in entries])
    pending = [appid for appid, details in details_map.items() if not game_details_service.has_igdb_lookup(details)]
    if not pending:
        return 0
    found = await igdb_client.get_times(pending)
    if found is None:
        return 0  # IGDB no respondió: quedan sin marcar y se reintenta la próxima vez
    for appid, times in found.items():
        game_details_service.apply_igdb(details_map[appid], times)
    db.commit()
    return len(found)


async def enrich_library_batch(db: Session, identifier: str, limit: int) -> dict:
    """Segunda pasada: primero la duración de IGDB de toda la biblioteca (de una, ver
    _lookup_igdb_durations) y después tu progreso de logros, de a un juego porque Steam no lo da
    por lote. Son lo que usan los filtros de duración y "Casi al 100%"."""
    steam_id = await resolve_steam_id(identifier)
    entries = _get_cached_entries(db, steam_id)
    durations_found = await _lookup_igdb_durations(db, entries)
    needs_progress = _progress_pending(db, steam_id)

    now = time.monotonic()
    pending = [entry for entry in entries if needs_progress(entry)]
    # Los que fallaron hace poco se saltean un rato: si no, un juego que siempre falla
    # quedaría primero en la lista y la pasada no avanzaría nunca.
    retry_later = [entry for entry in pending if now - _enrich_failures.get((steam_id, entry.appid), -1e9) < _RETRY_FAILED_AFTER_SECONDS]
    ready = [entry for entry in pending if entry not in retry_later]
    to_process = ready[:limit]
    failed = 0
    async with SteamClient() as client:
        for entry in to_process:
            try:
                progress = await client.get_achievement_progress(steam_id, entry.appid)
            except SteamAPIError:
                failed += 1
                _enrich_failures[(steam_id, entry.appid)] = now
            else:
                db.merge(
                    UserGameProgress(
                        steam_id=steam_id,
                        appid=entry.appid,
                        unlocked=progress["unlocked"],
                        total=progress["total"],
                        fetched_at=datetime.now(timezone.utc),
                    )
                )
            db.commit()

    return {
        "processed": len(to_process) + durations_found,
        # Los que se saltean por fallas recientes no cuentan: se reintentan en otra sesión.
        "remaining": max(len(ready) - len(to_process), 0),
        "failed": failed > 0,
        # Si la Steam Web API nos limitó, no tiene sentido seguir pidiendo ahora.
        "paused": throttle.is_cooling_down("achievements"),
    }


def _merge_union(primary: list[Game], friend: list[Game]) -> list[Game]:
    by_appid: dict[int, Game] = {game.appid: game for game in primary}
    for friend_game in friend:
        if friend_game.appid in by_appid:
            by_appid[friend_game.appid].source = "both"
        else:
            by_appid[friend_game.appid] = friend_game
    return list(by_appid.values())


def attach_user_data(db: Session, games: list[Game], steam_id: str) -> None:
    """Favoritos, ocultos, estados, progreso y datos de la tienda ya guardados, para `steam_id`."""
    _attach_favorites_and_details(db, games, steam_id)


def _attach_favorites_and_details(db: Session, games: list[Game], steam_id: str, personal: bool = True) -> None:
    """`personal=False`: solo datos públicos del juego (tienda, duración), nada del usuario."""
    favorite_appids = favorites_service.get_favorite_appids(db, steam_id) if personal else set()
    hidden_appids = hidden_service.get_hidden_appids(db, steam_id) if personal else set()
    states = get_states(db, steam_id) if personal else {}
    progress_map = _get_progress_map(db, steam_id) if personal else {}
    details_map = _get_cached_details_map(db, [game.appid for game in games])

    for game in games:
        game.is_favorite = game.appid in favorite_appids
        game.is_hidden = game.appid in hidden_appids
        game.state = states.get(game.appid)
        _apply_progress(game, progress_map.get(game.appid))
        details = details_map.get(game.appid)
        if details is not None:
            apply_cached_details(game, details)
    apply_durations(db, games)


def apply_durations(db: Session, games: list[Game]) -> None:
    found = duration_service.durations(db, [game.appid for game in games])
    for game in games:
        duration = found.get(game.appid)
        game.duration_hours = duration["hours"] if duration else None
        game.duration_source = duration["source"] if duration else None
        game.duration_samples = duration["samples"] if duration else 0
        game.duration_url = duration.get("url", "") if duration else ""


async def _ensure_store_metadata(db: Session, games: list[Game]) -> None:
    """Completa los datos de la tienda que falten antes de ordenar por precio o fecha."""
    details_map = _get_cached_details_map(db, [game.appid for game in games])
    pending = [
        game for game in games
        if game.appid not in details_map or not game_details_service.has_store_metadata(details_map[game.appid])
    ]
    if not pending:
        return
    store_data = await store_browse.get_items([game.appid for game in pending])
    for game in pending:
        details = details_map.get(game.appid)
        if details is None:
            details = CachedGameDetails(appid=game.appid, fetched_at=datetime.now(timezone.utc) - game_details_service.DETAILS_CACHE_TTL)
            db.add(details)
        game_details_service.apply_store_details(details, store_data[game.appid])
    db.commit()


def apply_cached_details(game: Game, details: CachedGameDetails) -> None:
    game.genres = normalize_genres(details.genres)
    game.short_description = details.short_description
    game.developer = details.developer
    game.price_cents = details.price_cents
    game.release_date = details.release_date
    game.review_score_desc = details.review_score_desc
    game.review_total = details.review_total
    game.store_data = game_details_service.has_store_metadata(details)
    game.review_good = game_details_service.split_excerpts(details.review_pros)
    game.review_bad = game_details_service.split_excerpts(details.review_cons)
    game.achievement_difficulty = game_details_service.difficulty_label(details)
    game.is_adult = bool(details.is_adult) or looks_adult_by_name(game.name)
    game.is_software = bool(details.is_software)
    if details.header_image:
        game.header_image = details.header_image
    modes = store_browse.player_modes(details.player_categories)
    game.single_player = modes["single_player"]
    game.coop = modes["coop"]
    game.multiplayer = modes["multiplayer"]
    game.local_multiplayer = modes["local_multiplayer"]


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
                # Steam manda 0 si nunca lo jugó.
                last_played=game.get("rtime_last_played") or None,
                fetched_at=now,
            )
        )
    db.commit()


def _to_schema_list(entries: list[CachedLibraryEntry]) -> list[Game]:
    return [_to_schema(entry) for entry in entries]


def _to_schema(entry: CachedLibraryEntry) -> Game:
    return Game(
        appid=entry.appid,
        name=entry.name,
        header_image=STEAM_HEADER_IMAGE_URL.format(appid=entry.appid),
        # genres y short_description se completan en _attach_favorites_and_details si ya están cacheados.
        genres=[],
        short_description="",
        playtime_forever_minutes=entry.playtime_forever_minutes,
        last_played=entry.last_played,
        # Hasta que la tienda lo clasifique, se adivina por el nombre (ver apply_cached_details).
        is_adult=looks_adult_by_name(entry.name),
    )


# ---------- Estados ("Jugando", "Terminado", "Abandonado") ----------

GAME_STATES = ("playing", "finished", "abandoned")


def get_states(db: Session, steam_id: str) -> dict[int, str]:
    rows = db.execute(select(GameState).where(GameState.steam_id == steam_id)).scalars()
    return {row.appid: row.state for row in rows}


def set_state(db: Session, steam_id: str, appid: int, state: str | None) -> None:
    """Guarda el estado del juego; None lo borra (vuelve a "sin estado")."""
    current = db.get(GameState, (steam_id, appid))
    if state is None:
        if current is not None:
            db.delete(current)
    elif current is None:
        db.add(GameState(steam_id=steam_id, appid=appid, state=state, updated_at=datetime.now(timezone.utc)))
    else:
        current.state = state
        current.updated_at = datetime.now(timezone.utc)
    # Terminado: sus horas de Steam cuentan para la duración que ve la comunidad.
    if state == "finished":
        duration_service.record_finish(db, steam_id, appid)
    else:
        duration_service.forget_finish(db, steam_id, appid)
    db.commit()


def state_summary(db: Session, steam_id: str, year: int | None = None) -> dict:
    """Cuántos juegos hay en cada estado, y cuántos se terminaron/empezaron en el año."""
    year = year or datetime.now(timezone.utc).year
    rows = db.execute(select(GameState).where(GameState.steam_id == steam_id)).scalars().all()
    counts = {state: 0 for state in GAME_STATES}
    finished_this_year = 0
    started_this_year = 0
    for row in rows:
        counts[row.state] = counts.get(row.state, 0) + 1
        updated = row.updated_at if row.updated_at.tzinfo else row.updated_at.replace(tzinfo=timezone.utc)
        if updated.year == year:
            if row.state == "finished":
                finished_this_year += 1
            elif row.state == "playing":
                started_this_year += 1
    return {"counts": counts, "year": year, "finished_this_year": finished_this_year, "started_this_year": started_this_year}


def _get_progress_map(db: Session, steam_id: str) -> dict[int, UserGameProgress]:
    rows = db.execute(select(UserGameProgress).where(UserGameProgress.steam_id == steam_id)).scalars()
    return {row.appid: row for row in rows}


def _apply_progress(game: Game, progress: UserGameProgress | None) -> None:
    if progress is not None and progress.total > 0:
        game.achievements_unlocked = progress.unlocked
        game.achievements_total = progress.total
