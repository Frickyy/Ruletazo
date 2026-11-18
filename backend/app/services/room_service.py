"""Salas en grupo. El estado vive en la base (no en memoria) para que sobreviva a un reinicio;
los navegadores lo consultan cada pocos segundos.

Reglas:
- Solo quien inició sesión con Steam arma una sala o entra a vetar (así cada veto tiene dueño).
- El juego que sale lo elige el backend, al azar entre los no vetados: nadie puede forzarlo.
- Una sala dura ROOM_TTL_HOURS. Cada persona tiene una sola sala abierta a la vez.
"""

import random
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.models.room import Room

ROOM_TTL_HOURS = 12
MAX_POOL = 1000
MAX_MEMBERS = 8
MAX_NAME_LENGTH = 120
STEAM_HEADER_IMAGE_URL = "https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/header.jpg"
# Sin letras ni números que se confunden (0/O, 1/l/I) para poder dictar el código.
_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


class RoomError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def create_room(db: Session, host: dict, games: list[dict]) -> dict:
    """`host`: {"steam_id", "name", "avatar"}. `games`: [{"appid", "name"}] (el pool de la ruleta)."""
    pool = _clean_pool(games)
    if len(pool) < 2:
        raise RoomError("Hacen falta al menos 2 juegos para armar una sala.")
    _purge_expired(db)
    db.execute(delete(Room).where(Room.host_steam_id == host["steam_id"]))
    room = Room(code=_new_code(db), host_steam_id=host["steam_id"], pool=pool, members=[_member(host)], vetoes={}, spin_id=0)
    db.add(room)
    db.commit()
    return room_state(room, host["steam_id"])


def get_room(db: Session, code: str) -> Room:
    room = db.get(Room, code.upper())
    if room is None or _is_expired(room):
        raise RoomError("Esta sala no existe o ya cerró.", status_code=404)
    return room


def join(db: Session, code: str, member: dict) -> dict:
    room = get_room(db, code)
    if not any(existing["steam_id"] == member["steam_id"] for existing in room.members):
        if len(room.members) >= MAX_MEMBERS:
            raise RoomError(f"La sala está llena (máximo {MAX_MEMBERS} personas).", status_code=409)
        room.members = [*room.members, _member(member)]
        _touch(room, "members")
        db.commit()
    return room_state(room, member["steam_id"])


def set_veto(db: Session, code: str, steam_id: str, appid: int, vetoed: bool) -> dict:
    room = get_room(db, code)
    _require_member(room, steam_id)
    if not any(game["appid"] == appid for game in room.pool):
        raise RoomError("Ese juego no está en la sala.", status_code=404)
    vetoes = {key: list(value) for key, value in room.vetoes.items()}
    voters = set(vetoes.get(str(appid), []))
    if vetoed:
        voters.add(steam_id)
    else:
        voters.discard(steam_id)
    if voters:
        vetoes[str(appid)] = sorted(voters)
    else:
        vetoes.pop(str(appid), None)
    room.vetoes = vetoes
    _touch(room, "vetoes")
    db.commit()
    return room_state(room, steam_id)


def spin(db: Session, code: str, steam_id: str) -> dict:
    room = get_room(db, code)
    if room.host_steam_id != steam_id:
        raise RoomError("Solo quien armó la sala puede girar.", status_code=403)
    candidates = [game for game in room.pool if str(game["appid"]) not in room.vetoes]
    if not candidates:
        raise RoomError("Vetaron todos los juegos. Saquen algún veto para poder girar.", status_code=409)
    room.spin_appid = random.choice(candidates)["appid"]
    room.spin_id = room.spin_id + 1
    room.updated_at = datetime.now(timezone.utc)
    db.commit()
    return room_state(room, steam_id)


def room_state(room: Room, viewer_steam_id: str | None) -> dict:
    return {
        "code": room.code,
        "host_steam_id": room.host_steam_id,
        "is_host": viewer_steam_id == room.host_steam_id,
        "is_member": any(member["steam_id"] == viewer_steam_id for member in room.members),
        "members": room.members,
        "pool": [{**game, "image": STEAM_HEADER_IMAGE_URL.format(appid=game["appid"])} for game in room.pool],
        "vetoes": room.vetoes,
        "spin": {"id": room.spin_id, "appid": room.spin_appid} if room.spin_id else None,
        "expires_at": (_aware(room.created_at) + timedelta(hours=ROOM_TTL_HOURS)).isoformat(),
    }


def _clean_pool(games: list[dict]) -> list[dict]:
    seen: set[int] = set()
    pool = []
    for game in games[:MAX_POOL]:
        appid = game.get("appid")
        if not isinstance(appid, int) or appid <= 0 or appid in seen:
            continue
        seen.add(appid)
        pool.append({"appid": appid, "name": str(game.get("name") or f"App {appid}")[:MAX_NAME_LENGTH]})
    return pool


def _member(person: dict) -> dict:
    return {
        "steam_id": person["steam_id"],
        "name": str(person.get("name") or "Jugador de Steam")[:64],
        "avatar": str(person.get("avatar") or "")[:512],
    }


def _require_member(room: Room, steam_id: str) -> None:
    if not any(member["steam_id"] == steam_id for member in room.members):
        raise RoomError("Primero entrá a la sala.", status_code=403)


def _touch(room: Room, field: str) -> None:
    flag_modified(room, field)
    room.updated_at = datetime.now(timezone.utc)


def _new_code(db: Session) -> str:
    while True:
        code = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(6))
        if db.get(Room, code) is None:
            return code


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _is_expired(room: Room) -> bool:
    return datetime.now(timezone.utc) - _aware(room.created_at) > timedelta(hours=ROOM_TTL_HOURS)


def _purge_expired(db: Session) -> None:
    limit = datetime.now(timezone.utc) - timedelta(hours=ROOM_TTL_HOURS)
    for room in db.execute(select(Room).where(Room.created_at < limit)).scalars():
        db.delete(room)
