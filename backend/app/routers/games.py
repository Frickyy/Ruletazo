import random
from typing import Awaitable, TypeVar

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.schemas.game import Game
from app.services import favorites_service, library_service
from app.services.steam_client import InvalidSteamIDError, PrivateProfileError, SteamAPIError

router = APIRouter(prefix="/api/games", tags=["games"])

_T = TypeVar("_T")

_COLLECTION_PATTERN = "^(all|favorites)$"

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
        playtime_forever_minutes=8100,
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
        playtime_forever_minutes=1320,
    ),
]


@router.get("/random", response_model=Game)
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
    db: Session = Depends(get_db),
) -> Game:
    """Devuelve un juego aleatorio: de la biblioteca real de `steamid` si se indica, o de una de ejemplo."""
    settings = get_settings()
    if not steamid or not settings.has_steam_api_key:
        return random.choice(_MOCK_LIBRARY)

    game = await _unwrap_steam_errors(
        library_service.get_random_from_library(db, steamid, friend_steamid, collection, genre)
    )
    if game is None:
        raise HTTPException(status_code=404, detail="No hay juegos que coincidan con ese filtro.")
    return game


@router.get("/library", response_model=list[Game])
async def get_library(
    steamid: str = Query(..., description="SteamID64 o vanity URL."),
    friend_steamid: str | None = Query(default=None, description="SteamID64/vanity de un familiar para combinar."),
    collection: str = Query(default="all", pattern=_COLLECTION_PATTERN, description="'all' o 'favorites'."),
    genre: str | None = Query(default=None, description="Filtra por género."),
    db: Session = Depends(get_db),
) -> list[Game]:
    """Devuelve la biblioteca completa de un usuario de Steam (cacheada en SQL), con filtros opcionales."""
    return await _unwrap_steam_errors(
        library_service.get_filtered_library(db, steamid, friend_steamid, collection, genre)
    )


@router.get("/genres", response_model=list[str])
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


@router.post("/library/classify")
async def classify_library(
    steamid: str = Query(..., description="SteamID64 o vanity URL."),
    limit: int = Query(default=25, ge=1, le=100, description="Cuántos juegos sin clasificar procesar en esta llamada."),
    db: Session = Depends(get_db),
) -> dict:
    """Clasifica hasta `limit` juegos pendientes. Llamar repetidas veces hasta que `remaining` sea 0."""
    return await _unwrap_steam_errors(library_service.classify_library_batch(db, steamid, limit))


@router.post("/favorites")
async def add_favorite(
    steamid: str = Query(..., description="SteamID64 o vanity URL."),
    appid: int = Query(..., description="appid del juego a favoritear."),
    db: Session = Depends(get_db),
) -> dict:
    steam_id = await _unwrap_steam_errors(library_service.resolve_steam_id(steamid))
    favorites_service.add_favorite(db, steam_id, appid)
    return {"appid": appid, "is_favorite": True}


@router.delete("/favorites")
async def remove_favorite(
    steamid: str = Query(..., description="SteamID64 o vanity URL."),
    appid: int = Query(..., description="appid del juego a sacar de favoritos."),
    db: Session = Depends(get_db),
) -> dict:
    steam_id = await _unwrap_steam_errors(library_service.resolve_steam_id(steamid))
    favorites_service.remove_favorite(db, steam_id, appid)
    return {"appid": appid, "is_favorite": False}


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

