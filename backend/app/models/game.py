from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class CachedLibraryEntry(Base):
    """Caché de un juego dentro de la biblioteca de un usuario de Steam.

    Evita golpear la Steam Web API en cada giro de la ruleta: mientras la fila
    no supere `LIBRARY_CACHE_TTL` (ver `services/library_service.py`), se reutiliza.
    """

    __tablename__ = "cached_library_entries"

    steam_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    appid: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    playtime_forever_minutes: Mapped[int] = mapped_column(Integer, default=0)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class CachedGameDetails(Base):
    """Caché de datos enriquecidos de un juego: géneros/sinopsis/reseñas (Store API),
    tiempo estimado para completarlo (HowLongToBeat) y dificultad de logros (Steam Web API).

    Se cachea por `appid` (no por usuario): es información global del juego, no de quién
    lo posee. TTL largo (`DETAILS_CACHE_TTL` en `services/game_details_service.py`) porque
    estos datos casi no cambian, a diferencia de la biblioteca (que sí crece seguido).
    """

    __tablename__ = "cached_game_details"

    appid: Mapped[int] = mapped_column(Integer, primary_key=True)
    genres: Mapped[list[str]] = mapped_column(JSON, default=list)
    short_description: Mapped[str] = mapped_column(Text, default="")
    price_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    release_date: Mapped[str] = mapped_column(String(32), default="")
    store_metadata_version: Mapped[int] = mapped_column(Integer, default=3)
    review_score_desc: Mapped[str] = mapped_column(String(64), default="")
    review_total: Mapped[int] = mapped_column(Integer, default=0)
    review_positive: Mapped[int] = mapped_column(Integer, default=0)
    featured_reviews: Mapped[list[str]] = mapped_column(JSON, default=list)
    hltb_main_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    hltb_completionist_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    achievement_total: Mapped[int] = mapped_column(Integer, default=0)
    achievement_avg_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class FavoriteGame(Base):
    """Un juego marcado como favorito por un usuario, para la colección "Favoritos" de la ruleta."""

    __tablename__ = "favorite_games"

    steam_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    appid: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
