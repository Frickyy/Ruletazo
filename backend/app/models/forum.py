"""Modelos del foro: reseñas con puntaje (1 a 10), hilos de discusión y respuestas.

Cada mensaje guarda el nombre y el avatar de Steam del autor en el momento de publicarlo,
así listar el foro no necesita consultar la Steam API por cada mensaje.
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ForumReview(Base):
    """Reseña de un usuario sobre un juego. Una por usuario y juego (se puede editar)."""

    __tablename__ = "forum_reviews"
    __table_args__ = (UniqueConstraint("appid", "steam_id", name="uq_forum_review_author"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    appid: Mapped[int] = mapped_column(Integer, index=True)
    game_name: Mapped[str] = mapped_column(String(255), default="")
    steam_id: Mapped[str] = mapped_column(String(32), index=True)
    author_name: Mapped[str] = mapped_column(String(64), default="")
    author_avatar: Mapped[str] = mapped_column(String(512), default="")
    score: Mapped[int] = mapped_column(Integer)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class ForumThread(Base):
    """Hilo de discusión sobre un juego."""

    __tablename__ = "forum_threads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    appid: Mapped[int] = mapped_column(Integer, index=True)
    game_name: Mapped[str] = mapped_column(String(255), default="")
    steam_id: Mapped[str] = mapped_column(String(32), index=True)
    author_name: Mapped[str] = mapped_column(String(64), default="")
    author_avatar: Mapped[str] = mapped_column(String(512), default="")
    title: Mapped[str] = mapped_column(String(120))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    last_activity_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)


class ForumPost(Base):
    """Respuesta dentro de un hilo."""

    __tablename__ = "forum_posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    thread_id: Mapped[int] = mapped_column(ForeignKey("forum_threads.id", ondelete="CASCADE"), index=True)
    steam_id: Mapped[str] = mapped_column(String(32), index=True)
    author_name: Mapped[str] = mapped_column(String(64), default="")
    author_avatar: Mapped[str] = mapped_column(String(512), default="")
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
