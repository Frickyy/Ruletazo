from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, Integer, String, Text
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
    # Última vez que lo jugó (timestamp Unix de Steam, `rtime_last_played`). None si nunca.
    last_played: Mapped[int | None] = mapped_column(Integer, nullable=True)
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
    developer: Mapped[str] = mapped_column(String(255), default="")
    price_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    release_date: Mapped[str] = mapped_column(String(32), default="")
    # Portada según la tienda (los juegos recientes no la tienen en la dirección fija). Vacío si no se sabe.
    header_image: Mapped[str] = mapped_column(String(512), default="")
    # Categorías de jugadores de la tienda (un jugador, cooperativo, multijugador…). Ver store_browse.player_modes.
    player_categories: Mapped[list[int]] = mapped_column(JSON, default=list)
    # La tienda lo marca como contenido sexual para adultos (descriptores 3 o 4).
    is_adult: Mapped[bool] = mapped_column(Boolean, default=False)
    store_metadata_version: Mapped[int] = mapped_column(Integer, default=3)
    review_score_desc: Mapped[str] = mapped_column(String(64), default="")
    review_total: Mapped[int] = mapped_column(Integer, default=0)
    review_positive: Mapped[int] = mapped_column(Integer, default=0)
    featured_reviews: Mapped[list[str]] = mapped_column(JSON, default=list)
    # La reseña positiva y la negativa más votadas como útiles en Steam ("lo bueno" y "lo malo").
    review_pros: Mapped[str] = mapped_column(Text, default="")
    review_cons: Mapped[str] = mapped_column(Text, default="")
    reviews_version: Mapped[int] = mapped_column(Integer, default=0)
    hltb_main_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    hltb_completionist_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Se buscó en HLTB con esta versión (aunque no haya habido resultado). Ver HLTB_VERSION.
    hltb_version: Mapped[int] = mapped_column(Integer, default=0)
    achievement_total: Mapped[int] = mapped_column(Integer, default=0)
    achievement_avg_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class FavoriteGame(Base):
    """Un juego marcado como favorito por un usuario, para la colección "Favoritos" de la ruleta."""

    __tablename__ = "favorite_games"

    steam_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    appid: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class HiddenGame(Base):
    """Un juego que el usuario pidió no volver a ver en la ruleta ("No me lo muestres más")."""

    __tablename__ = "hidden_games"

    steam_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    appid: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class GameState(Base):
    """En qué está el usuario con un juego: jugando, terminado o abandonado."""

    __tablename__ = "game_states"

    steam_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    appid: Mapped[int] = mapped_column(Integer, primary_key=True)
    # "playing", "finished" o "abandoned"
    state: Mapped[str] = mapped_column(String(16))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class UserGameProgress(Base):
    """Logros desbloqueados por el usuario en un juego (para el filtro "Casi al 100%")."""

    __tablename__ = "user_game_progress"

    steam_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    appid: Mapped[int] = mapped_column(Integer, primary_key=True)
    unlocked: Mapped[int] = mapped_column(Integer, default=0)
    # 0 si el juego no tiene logros.
    total: Mapped[int] = mapped_column(Integer, default=0)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class CompletionSample(Base):
    """Horas en Steam de alguien al marcar un juego como terminado (ver duration_service)."""

    __tablename__ = "completion_samples"

    steam_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    appid: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    minutes: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class UserProfile(Base):
    """Preferencias del perfil de un usuario. Sin fila = valores por defecto (perfil privado)."""

    __tablename__ = "user_profiles"

    steam_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    # Privado por defecto: nadie ve tu perfil hasta que lo hacés público.
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
    # Pedir tu progreso de logros a Steam en segundo plano (para "Casi al 100%"). Lo activás vos.
    track_achievements: Mapped[bool] = mapped_column(Boolean, default=False)
    # Epoch del último "borrar mis datos": las sesiones emitidas hasta ese momento quedan inválidas.
    sessions_valid_after: Mapped[int | None] = mapped_column(Integer, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Feedback(Base):
    """Comentarios que deja la gente desde el formulario de feedback. Se guardan siempre, aunque
    el mail no salga (SMTP sin configurar o caído), para no perder ninguno."""

    __tablename__ = "feedback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String(16))
    message: Mapped[str] = mapped_column(Text)
    # Nombre de Steam al momento de mandarlo (None sin sesión): va en el asunto del mail.
    steam_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    steam_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    page: Mapped[str | None] = mapped_column(String(200), nullable=True)
    emailed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
