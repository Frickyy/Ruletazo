import random
from typing import Awaitable, TypeVar

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.rate_limit import background, steam_reads
from app.core.security import require_steam_id
from app.db.session import get_db
from app.schemas.game import Game
from app.services import favorites_service, game_details_service, hidden_service, library_service
from app.services.steam_client import InvalidSteamIDError, PrivateProfileError, SteamAPIError, SteamClient

router = APIRouter(prefix="/api/games", tags=["games"])

_T = TypeVar("_T")

_COLLECTION_PATTERN = "^(all|favorites)$"
_SORT_PATTERN = "^(name|price|release_date)$"
_DIRECTION_PATTERN = "^(asc|desc)$"
_PLAYTIME_PATTERN = "^(zero|under2|all)$"

# Biblioteca de ejemplo: se usa si no se pasa `steamid` o si falta STEAM_API_KEY,
# para que el frontend siempre tenga algo que mostrar en desarrollo.
_MOCK_LIBRARY: list[Game] = [
    Game(
        appid=1091500,
        name="Cyberpunk 2077",
        header_image="https://cdn.cloudflare.steamstatic.com/steam/apps/1091500/header.jpg",
        genres=["RPG", "Acción", "Mundo abierto"],
        short_description="Un RPG de mundo abierto ambientado en Night City, una megalópolis obsesionada con el poder.",
        playtime_forever_minutes=2760,
    ),
    Game(
        appid=1245620,
        name="ELDEN RING",
        header_image="https://cdn.cloudflare.steamstatic.com/steam/apps/1245620/header.jpg",
        genres=["Souls-like", "RPG", "Fantasía oscura"],
        short_description="Un RPG de fantasía y acción ambientado en un mundo creado por Hidetaka Miyazaki y George R. R. Martin.",
        playtime_forever_minutes=5400,
    ),
    Game(
        appid=413150,
        name="Stardew Valley",
        header_image="https://cdn.cloudflare.steamstatic.com/steam/apps/413150/header.jpg",
        genres=["Simulación", "Vida rural", "Indie"],
        short_description="Heredaste la vieja granja de tu abuelo. Con herramientas de segunda mano y algo de dinero, sales a labrarte una nueva vida.",
        playtime_forever_minutes=90,
    ),
    Game(
        appid=1174180,
        name="Red Dead Redemption 2",
        header_image="https://cdn.cloudflare.steamstatic.com/steam/apps/1174180/header.jpg",
        genres=["Acción", "Aventura", "Mundo abierto"],
        short_description="América, 1899. El fin de la era del salvaje oeste ha comenzado.",
        playtime_forever_minutes=1980,
    ),
    Game(
        appid=1145360,
        name="Hades",
        header_image="https://cdn.cloudflare.steamstatic.com/steam/apps/1145360/header.jpg",
        genres=["Roguelike", "Acción", "Indie"],
        short_description="Combate a golpe de estoque para escapar del Inframundo en este roguelike de acción de la casa de Bastion.",
        playtime_forever_minutes=0,
    ),
]


@router.get("/random", response_model=Game, dependencies=[Depends(steam_reads)])
async def get_random_game(
    steamid: str | None = Query(
        default=None,
        description="SteamID64 o vanity URL. Si se omite (o falta STEAM_API_KEY), se usa una biblioteca de ejemplo.",
    ),
    friend_steamid: str | None = Query(
        default=None, description="SteamID64/vanity de un familiar: combina su biblioteca con la tuya (unión)."
    ),
    collection: str = Query(default="all", pattern=_COLLECTION_PATTERN, description="'all' o 'favorites'."),
    genre: str | None = Query(default=None, description="Filtra por género (ej. 'Rol', 'Acción')."),
    search: str | None = Query(default=None, description="Busca por nombre del juego."),
    sort_by: str = Query(default="name", pattern=_SORT_PATTERN, description="name, price o release_date."),
    sort_direction: str = Query(default="asc", pattern=_DIRECTION_PATTERN, description="asc o desc."),
    playtime_filter: str = Query(default="all", pattern=_PLAYTIME_PATTERN, description="zero, under2 o all."),
    db: Session = Depends(get_db),
) -> Game:
    """Devuelve un juego aleatorio: de la biblioteca real de `steamid` si se indica, o de una de ejemplo."""
    settings = get_settings()
    if not steamid or not settings.has_steam_api_key:
        mock_games = _filter_mock_library(_MOCK_LIBRARY, genre, playtime_filter)
        if not mock_games:
            raise HTTPException(status_code=404, detail="No hay juegos que coincidan con ese filtro.")
        return random.choice(mock_games)

    game = await _unwrap_steam_errors(
        library_service.get_random_from_library(
            db, steamid, friend_steamid, collection, genre, search, sort_by, sort_direction, playtime_filter
        )
    )
    if game is None:
        raise HTTPException(status_code=404, detail="No hay juegos que coincidan con ese filtro.")
    return game


@router.get("/details", response_model=Game, dependencies=[Depends(steam_reads)])
async def get_game_details(
    appid: int = Query(..., description="appid del juego que frenó en el rodillo."),
    steamid: str | None = Query(default=None, description="SteamID64 o vanity URL. Sin él se usa la biblioteca de ejemplo."),
    friend_steamid: str | None = Query(default=None, description="SteamID64/vanity de familiares, separados por coma."),
    db: Session = Depends(get_db),
) -> Game:
    """Ficha completa de un juego de la biblioteca. La ruleta elige el juego en el navegador
    (el que queda en la ventana del rodillo) y después pide sus datos acá."""
    settings = get_settings()
    if not steamid or not settings.has_steam_api_key:
        mock = next((game for game in _MOCK_LIBRARY if game.appid == appid), None)
        if mock is None:
            raise HTTPException(status_code=404, detail="Ese juego no está en la biblioteca de ejemplo.")
        # Los juegos de ejemplo son reales: su ficha (HLTB, reseñas, logros) se completa igual que
        # la de cualquier juego, así la demo no muestra todo vacío.
        game = mock.model_copy(deep=True)
        details = await game_details_service.get_or_fetch_details(db, game.appid, game.name)
        library_service.apply_cached_details(game, details)
        game.short_description = mock.short_description  # la de ejemplo está en español; la Store la da en inglés
        return game

    game = await _unwrap_steam_errors(library_service.get_game_details(db, steamid, friend_steamid, appid))
    if game is None:
        raise HTTPException(status_code=404, detail="Ese juego no está en la biblioteca.")
    return game


@router.get("/library", response_model=list[Game], dependencies=[Depends(steam_reads)])
async def get_library(
    steamid: str = Query(..., description="SteamID64 o vanity URL."),
    friend_steamid: str | None = Query(default=None, description="SteamID64/vanity de un familiar para combinar."),
    collection: str = Query(default="all", pattern=_COLLECTION_PATTERN, description="'all' o 'favorites'."),
    genre: str | None = Query(default=None, description="Filtra por género."),
    search: str | None = Query(default=None, description="Busca por nombre del juego."),
    sort_by: str = Query(default="name", pattern=_SORT_PATTERN, description="name, price o release_date."),
    sort_direction: str = Query(default="asc", pattern=_DIRECTION_PATTERN, description="asc o desc."),
    playtime_filter: str = Query(default="all", pattern=_PLAYTIME_PATTERN, description="zero, under2 o all."),
    db: Session = Depends(get_db),
) -> list[Game]:
    """Devuelve la biblioteca completa de un usuario de Steam (cacheada en SQL), con filtros opcionales."""
    return await _unwrap_steam_errors(
        library_service.get_filtered_library(
            db, steamid, friend_steamid, collection, genre, search, sort_by, sort_direction, playtime_filter
        )
    )


@router.get("/genres", response_model=list[str], dependencies=[Depends(steam_reads)])
async def get_genres(
    steamid: str = Query(..., description="SteamID64 o vanity URL."),
    friend_steamid: str | None = Query(default=None, description="SteamID64/vanity de un familiar para combinar."),
    db: Session = Depends(get_db),
) -> list[str]:
    """Géneros ya clasificados (Store API) entre los juegos de la biblioteca, para armar el filtro."""
    games = await _unwrap_steam_errors(
        library_service.get_filtered_library(db, steamid, friend_steamid, collection="all", genre=None)
    )
    return sorted({genre for game in games for genre in game.genres})


@router.get("/library/classification-status")
async def get_classification_status(
    steamid: str = Query(..., description="SteamID64 o vanity URL."),
    db: Session = Depends(get_db),
) -> dict:
    """Cuántos juegos de la biblioteca ya tienen género/reseñas/HLTB/logros clasificados."""
    return await _unwrap_steam_errors(library_service.get_classification_status(db, steamid))


@router.get("/achievements", dependencies=[Depends(steam_reads)])
async def get_player_achievements(steamid: str = Query(...), appid: int = Query(...)) -> dict:
    """Devuelve el progreso de logros del usuario para el juego elegido."""
    resolved_id = await _unwrap_steam_errors(library_service.resolve_steam_id(steamid))
    async with SteamClient() as client:
        return await _unwrap_steam_errors(client.get_player_achievements(resolved_id, appid))


@router.post("/library/classify", dependencies=[Depends(background)])
async def classify_library(
    steamid: str = Query(..., description="SteamID64 o vanity URL."),
    limit: int = Query(default=100, ge=1, le=200, description="Cuántos juegos sin clasificar procesar en esta llamada."),
    db: Session = Depends(get_db),
) -> dict:
    """Clasifica hasta `limit` juegos pendientes. Llamar repetidas veces hasta que `remaining` sea 0."""
    return await _unwrap_steam_errors(library_service.classify_library_batch(db, steamid, limit))


@router.post("/library/enrich", dependencies=[Depends(background)])
async def enrich_library(
    steamid: str = Query(..., description="SteamID64 o vanity URL."),
    limit: int = Query(default=5, ge=1, le=20, description="Cuántos juegos procesar (duración y logros)."),
    db: Session = Depends(get_db),
) -> dict:
    """Segunda pasada de la clasificación: duración (HowLongToBeat) y progreso de logros."""
    return await _unwrap_steam_errors(library_service.enrich_library_batch(db, steamid, limit))


class StateIn(BaseModel):
    appid: int
    state: str | None = Field(default=None, pattern="^(playing|finished|abandoned)$")


@router.put("/state")
async def set_game_state(
    payload: StateIn, db: Session = Depends(get_db), steam_id: str = Depends(require_steam_id)
) -> dict:
    """Marca un juego como jugando, terminado o abandonado (null lo borra). Para el usuario de la sesión."""
    library_service.set_state(db, steam_id, payload.appid, payload.state)
    return {"appid": payload.appid, "state": payload.state}


@router.get("/states/summary")
async def get_state_summary(db: Session = Depends(get_db), steam_id: str = Depends(require_steam_id)) -> dict:
    """Cuántos juegos hay en cada estado y cuántos se terminaron o empezaron este año."""
    return library_service.state_summary(db, steam_id)


# Favoritos: se guardan para el usuario de la sesión (cookie firmada), no para el `steamid`
# que mande el navegador, así nadie puede tocar los favoritos de otra persona.
@router.post("/favorites")
async def add_favorite(
    appid: int = Query(..., description="appid del juego a favoritear."),
    db: Session = Depends(get_db),
    steam_id: str = Depends(require_steam_id),
) -> dict:
    favorites_service.add_favorite(db, steam_id, appid)
    return {"appid": appid, "is_favorite": True}


@router.delete("/favorites")
async def remove_favorite(
    appid: int = Query(..., description="appid del juego a sacar de favoritos."),
    db: Session = Depends(get_db),
    steam_id: str = Depends(require_steam_id),
) -> dict:
    favorites_service.remove_favorite(db, steam_id, appid)
    return {"appid": appid, "is_favorite": False}


# "No me lo muestres más": igual que los favoritos, se guarda para el usuario de la sesión.
@router.post("/hidden")
async def hide_game(
    appid: int = Query(..., description="appid del juego a ocultar de la ruleta."),
    db: Session = Depends(get_db),
    steam_id: str = Depends(require_steam_id),
) -> dict:
    hidden_service.hide_game(db, steam_id, appid)
    return {"appid": appid, "is_hidden": True}


@router.delete("/hidden")
async def unhide_game(
    appid: int = Query(..., description="appid del juego a volver a mostrar."),
    db: Session = Depends(get_db),
    steam_id: str = Depends(require_steam_id),
) -> dict:
    hidden_service.unhide_game(db, steam_id, appid)
    return {"appid": appid, "is_hidden": False}


async def _unwrap_steam_errors(coro: Awaitable[_T]) -> _T:
    """Traduce las excepciones de Steam a HTTPException. Comparten los mismos códigos en todos los endpoints."""
    try:
        return await coro
    except InvalidSteamIDError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PrivateProfileError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except SteamAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


def _filter_mock_library(games: list[Game], genre: str | None, playtime_filter: str) -> list[Game]:
    """Aplica al catálogo de desarrollo las mismas condiciones de horas y género."""
    filtered = games
    if genre:
        filtered = [game for game in filtered if genre in game.genres]
    if playtime_filter == "zero":
        filtered = [game for game in filtered if game.playtime_forever_minutes == 0]
    elif playtime_filter == "under2":
        filtered = [game for game in filtered if game.playtime_forever_minutes < 120]
    return filtered

