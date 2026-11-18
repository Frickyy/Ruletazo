"""Perfiles de usuario y configuración pública de la página."""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.rate_limit import steam_reads
from app.core.security import SESSION_COOKIE, current_steam_id, require_steam_id
from app.db.session import get_db
from app.schemas.game import Game
from app.services import library_service, profile_service
from app.services.steam_client import InvalidSteamIDError, PrivateProfileError, SteamAPIError, SteamClient

router = APIRouter(prefix="/api", tags=["profiles"])


class PreferencesIn(BaseModel):
    is_public: bool | None = None
    track_achievements: bool | None = None


@router.get("/config")
def public_config() -> dict:
    """Lo que el frontend necesita saber de la configuración: links para apoyar el proyecto,
    tiendas con afiliados y si la duración (HowLongToBeat) está activa."""
    settings = get_settings()
    return {
        "support_links": settings.support_link_list,
        "affiliate_stores": settings.affiliate_store_list,
        "hltb_enabled": settings.hltb_enabled,
        "contact_email": settings.contact_email,
    }


@router.put("/profiles/me")
def update_my_preferences(
    preferences: PreferencesIn, db: Session = Depends(get_db), steam_id: str = Depends(require_steam_id)
) -> dict:
    return profile_service.update_preferences(
        db, steam_id, is_public=preferences.is_public, track_achievements=preferences.track_achievements
    )


@router.delete("/profiles/me")
def delete_my_data(db: Session = Depends(get_db), steam_id: str = Depends(require_steam_id)) -> Response:
    """Borra todos tus datos de la página y cierra la sesión."""
    profile_service.delete_user_data(db, steam_id)
    response = Response(status_code=204)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response


@router.get("/profiles/{steamid}", dependencies=[Depends(steam_reads)])
async def get_profile(
    steamid: str, db: Session = Depends(get_db), viewer: str | None = Depends(current_steam_id)
) -> dict:
    """Perfil de un usuario. Los privados solo los ve su dueño (404 para el resto, sin revelar si existe)."""
    target = await _resolve(steamid)
    if not profile_service.can_view(db, target, viewer):
        raise HTTPException(status_code=404, detail="Este perfil es privado o no existe.")
    try:
        async with SteamClient() as client:
            steam_profile = await client.get_profile(target)
    except SteamAPIError:
        steam_profile = {"name": "Jugador de Steam", "avatar": ""}
    return profile_service.build_profile(db, target, viewer, steam_profile)


@router.get("/profiles/{steamid}/common", response_model=list[Game], dependencies=[Depends(steam_reads)])
async def games_in_common(
    steamid: str, db: Session = Depends(get_db), viewer: str = Depends(require_steam_id)
) -> list[Game]:
    """Juegos que tenés vos y el dueño del perfil (si es público), con modos de juego para elegir juntos."""
    target = await _resolve(steamid)
    if target == viewer:
        raise HTTPException(status_code=400, detail="Ese es tu propio perfil.")
    if not profile_service.can_view(db, target, viewer):
        raise HTTPException(status_code=404, detail="Este perfil es privado o no existe.")
    try:
        mine = await library_service.get_library(db, viewer)
        theirs = {game.appid for game in await library_service.get_library(db, target)}
    except PrivateProfileError as exc:
        raise HTTPException(status_code=403, detail="La biblioteca de Steam de este usuario es privada.") from exc
    except SteamAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    common = [game for game in mine if game.appid in theirs]
    for game in common:
        game.source = "both"
    library_service.attach_user_data(db, common, viewer)
    return sorted(common, key=lambda game: game.name.casefold())


async def _resolve(identifier: str) -> str:
    try:
        return await library_service.resolve_steam_id(identifier)
    except InvalidSteamIDError as exc:
        raise HTTPException(status_code=404, detail="Este perfil es privado o no existe.") from exc
    except SteamAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
