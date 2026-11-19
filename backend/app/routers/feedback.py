"""Formulario de feedback: cualquiera puede mandar un comentario, con o sin sesión."""

import asyncio

from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.core.rate_limit import feedback_limit
from app.core.security import current_steam_id
from app.db.session import SessionLocal, get_db
from app.models.game import Feedback
from app.services import feedback_service
from app.services.steam_client import SteamAPIError, SteamClient

router = APIRouter(prefix="/api", tags=["feedback"])


class FeedbackIn(BaseModel):
    kind: str = "other"
    message: str = Field(max_length=feedback_service.MAX_MESSAGE)
    page: str | None = Field(default=None, max_length=feedback_service.MAX_PAGE)
    # Campo trampa: invisible para las personas; si viene lleno, lo mandó un bot.
    website: str | None = None

    @field_validator("message")
    @classmethod
    def not_blank(cls, value: str) -> str:
        if len(value.strip()) < 5:
            raise ValueError("Escribí un poco más (al menos 5 caracteres).")
        return value


@router.post("/feedback", status_code=202, dependencies=[Depends(feedback_limit)])
def send_feedback(
    payload: FeedbackIn,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    steam_id: str | None = Depends(current_steam_id),
) -> dict:
    if payload.website:
        return {"ok": True}  # al bot se le responde igual, para que no insista
    feedback = feedback_service.save_feedback(
        db, kind=payload.kind, message=payload.message, steam_id=steam_id, steam_name=None, page=payload.page
    )
    background.add_task(_name_and_send, feedback.id, steam_id)
    return {"ok": True}


async def _name_and_send(feedback_id: int, steam_id: str | None) -> None:
    """En segundo plano (la respuesta ya salió): busca el nombre de Steam para el asunto y manda el mail."""
    name = None
    if steam_id:
        try:
            async with SteamClient() as client:
                name = (await client.get_profile(steam_id)).get("name")
        except SteamAPIError:
            name = None  # el mail sale igual, como "Jugador de Steam" y con el link al perfil
    # Sesión propia: la del pedido ya se cerró cuando corre la tarea en segundo plano.
    if name:
        with SessionLocal() as db:
            feedback = db.get(Feedback, feedback_id)
            if feedback is not None:
                feedback.steam_name = " ".join(name.split())[: feedback_service.MAX_NAME]
                db.commit()
    # smtplib bloquea: se manda en un hilo para no frenar al resto del servidor.
    await asyncio.to_thread(_send, feedback_id)


def _send(feedback_id: int) -> None:
    with SessionLocal() as db:
        feedback_service.send_feedback_email(db, feedback_id)
