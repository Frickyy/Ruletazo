"""Estadísticas de uso anónimas (ver services/usage_service.py)."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.rate_limit import RateLimit
from app.core.security import current_steam_id, is_moderator
from app.db.session import get_db
from app.services import usage_service

router = APIRouter(prefix="/api", tags=["usage"])

# Una visita normal manda pocos eventos; esto solo frena a quien quiera inflar los números.
events_limit = RateLimit("events", max_requests=300, window_seconds=10 * 60)


class EventIn(BaseModel):
    event: str = Field(max_length=32)


@router.post("/events", status_code=204, dependencies=[Depends(events_limit)])
def record_event(payload: EventIn, db: Session = Depends(get_db), steam_id: str | None = Depends(current_steam_id)) -> None:
    if payload.event not in usage_service.EVENTS:
        raise HTTPException(status_code=422, detail="Evento desconocido.")
    # Quien mantiene la página (ADMIN_STEAM_IDS) no cuenta, para que sus pruebas no inflen los números.
    if is_moderator(steam_id):
        return
    usage_service.record(db, payload.event)
