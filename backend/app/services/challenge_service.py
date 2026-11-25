"""Pila de pendientes y desafíos del mes.

Todo se calcula con datos que la página ya tiene (la copia de la biblioteca, los estados que
marca el usuario y las duraciones de duration_service): no se guarda nada nuevo ni se pide nada a
Steam. Los desafíos se renuevan solos cada mes.
"""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.game import CachedLibraryEntry, GameState
from app.services import duration_service

SHORT_GAME_HOURS = 5
FINISH_GOAL = 3


def backlog(db: Session, steam_id: str) -> dict:
    """Juegos propios sin estrenar (0 minutos), sin contar los que ya marcó como terminados o abandonados."""
    entries = db.execute(
        select(CachedLibraryEntry.appid, CachedLibraryEntry.playtime_forever_minutes).where(
            CachedLibraryEntry.steam_id == steam_id
        )
    ).all()
    closed = set(
        db.execute(
            select(GameState.appid).where(GameState.steam_id == steam_id, GameState.state.in_(("finished", "abandoned")))
        ).scalars()
    )
    unplayed = sum(1 for appid, minutes in entries if minutes == 0 and appid not in closed)
    return {"unplayed": unplayed, "total": len(entries)}


def monthly_challenges(db: Session, steam_id: str, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    rows = db.execute(select(GameState).where(GameState.steam_id == steam_id)).scalars().all()
    this_month = [row for row in rows if _same_month(row.updated_at, now)]
    finished = [row.appid for row in this_month if row.state == "finished"]
    started = [row.appid for row in this_month if row.state == "playing"]

    short = [appid for appid, duration in duration_service.durations(db, finished).items() if duration["hours"] <= SHORT_GAME_HOURS]

    challenges = [
        {
            "id": "start",
            "title": "Empezá algo nuevo",
            "description": "Marcá un juego como “Jugando” este mes.",
            "progress": min(len(started), 1),
            "goal": 1,
        },
        {
            "id": "short",
            "title": "Uno cortito",
            "description": f"Terminá un juego que dure {SHORT_GAME_HOURS} horas o menos.",
            "progress": min(len(short), 1),
            "goal": 1,
        },
        {
            "id": "finish",
            "title": f"Terminá {FINISH_GOAL} juegos",
            "description": "Marcalos como “Terminado” antes de que termine el mes.",
            "progress": min(len(finished), FINISH_GOAL),
            "goal": FINISH_GOAL,
        },
    ]
    return {"year": now.year, "month": now.month, "items": challenges}


def _same_month(value: datetime, now: datetime) -> bool:
    value = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return (value.year, value.month) == (now.year, now.month)
