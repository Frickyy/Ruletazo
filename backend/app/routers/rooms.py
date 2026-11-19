"""Salas en grupo: armar, entrar, vetar y girar. Los navegadores consultan GET cada pocos segundos."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.rate_limit import RateLimit
from app.core.security import current_steam_id, require_steam_id
from app.db.session import get_db
from app.services import room_service
from app.services.steam_client import SteamAPIError, SteamClient

router = APIRouter(prefix="/api/rooms", tags=["rooms"])

# Consultar el estado cada 2 s son ~300 pedidos en 10 minutos por persona: margen de sobra.
room_polls = RateLimit("room_polls", max_requests=900, window_seconds=10 * 60)
room_writes = RateLimit("room_writes", max_requests=300, window_seconds=10 * 60)


class PoolGame(BaseModel):
    appid: int
    name: str = ""


class RoomIn(BaseModel):
    games: list[PoolGame] = Field(default_factory=list, max_length=room_service.MAX_POOL)


class VetoIn(BaseModel):
    appid: int
    vetoed: bool = True


@router.post("", status_code=201, dependencies=[Depends(room_writes)])
async def create_room(payload: RoomIn, db: Session = Depends(get_db), steam_id: str = Depends(require_steam_id)) -> dict:
    host = await _person(steam_id)
    return _run(lambda: room_service.create_room(db, host, [game.model_dump() for game in payload.games]))


@router.get("/{code}", dependencies=[Depends(room_polls)])
def get_room(code: str, db: Session = Depends(get_db), viewer: str | None = Depends(current_steam_id)) -> dict:
    return _run(lambda: room_service.room_state(room_service.get_room(db, code), viewer))


@router.post("/{code}/join", dependencies=[Depends(room_writes)])
async def join_room(code: str, db: Session = Depends(get_db), steam_id: str = Depends(require_steam_id)) -> dict:
    _run(lambda: room_service.get_room(db, code))  # 404 antes de pedirle el perfil a Steam
    member = await _person(steam_id)
    return _run(lambda: room_service.join(db, code, member))


@router.put("/{code}/veto", dependencies=[Depends(room_writes)])
def veto(code: str, payload: VetoIn, db: Session = Depends(get_db), steam_id: str = Depends(require_steam_id)) -> dict:
    return _run(lambda: room_service.set_veto(db, code, steam_id, payload.appid, payload.vetoed))


@router.post("/{code}/spin", dependencies=[Depends(room_writes)])
def spin(code: str, db: Session = Depends(get_db), steam_id: str = Depends(require_steam_id)) -> dict:
    return _run(lambda: room_service.spin(db, code, steam_id))


async def _person(steam_id: str) -> dict:
    try:
        async with SteamClient() as client:
            profile = await client.get_profile(steam_id)
    except SteamAPIError:
        profile = {}
    return {"steam_id": steam_id, "name": profile.get("name", "Jugador de Steam"), "avatar": profile.get("avatar", "")}


def _run(action):
    try:
        return action()
    except room_service.RoomError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
