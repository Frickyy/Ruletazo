"""Salas para elegir a qué jugar en grupo: quien la arma comparte un link, los demás entran,
vetan los juegos que no quieren y la ruleta gira para todos a la vez."""

from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Room(Base):
    __tablename__ = "rooms"

    code: Mapped[str] = mapped_column(String(12), primary_key=True)
    host_steam_id: Mapped[str] = mapped_column(String(32), index=True)
    # [{"appid": int, "name": str}] — la portada se arma con el appid, no se guarda una URL ajena.
    pool: Mapped[list[dict]] = mapped_column(JSON, default=list)
    # [{"steam_id": str, "name": str, "avatar": str}]
    members: Mapped[list[dict]] = mapped_column(JSON, default=list)
    # {"<appid>": ["<steam_id>", ...]}
    vetoes: Mapped[dict] = mapped_column(JSON, default=dict)
    # Último giro: todos los navegadores animan el rodillo hasta este juego.
    spin_id: Mapped[int] = mapped_column(Integer, default=0)
    spin_appid: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
