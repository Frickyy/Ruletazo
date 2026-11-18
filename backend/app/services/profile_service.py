"""Perfiles: qué estás jugando, qué terminaste, tus favoritos y tus reseñas del foro.

Un perfil es privado por defecto: solo lo ve su dueño hasta que lo hace público. Así nadie
queda expuesto sin elegirlo (y se respeta que Steam pide consultar datos de un usuario solo
cuando él lo pide).
"""

import time
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.forum import ForumPost, ForumReport, ForumReview, ForumThread
from app.models.room import Room
from app.models.game import (
    CachedGameDetails,
    CachedLibraryEntry,
    CompletionSample,
    FavoriteGame,
    GameState,
    HiddenGame,
    UserGameProgress,
    UserProfile,
)

STEAM_HEADER_IMAGE_URL = "https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/header.jpg"
MAX_GAMES_PER_SECTION = 8
MAX_REVIEWS = 5


def get_preferences(db: Session, steam_id: str) -> UserProfile | None:
    return db.get(UserProfile, steam_id)


def is_public(db: Session, steam_id: str) -> bool:
    row = get_preferences(db, steam_id)
    return bool(row and row.is_public)


def tracks_achievements(db: Session, steam_id: str) -> bool:
    row = get_preferences(db, steam_id)
    return bool(row and row.track_achievements)


def can_view(db: Session, target_steam_id: str, viewer_steam_id: str | None) -> bool:
    return target_steam_id == viewer_steam_id or is_public(db, target_steam_id)


def update_preferences(
    db: Session, steam_id: str, *, is_public: bool | None = None, track_achievements: bool | None = None
) -> dict:
    row = get_preferences(db, steam_id)
    if row is None:
        row = UserProfile(steam_id=steam_id, is_public=False, track_achievements=False)
        db.add(row)
    if is_public is not None:
        row.is_public = is_public
    if track_achievements is not None:
        row.track_achievements = track_achievements
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"is_public": row.is_public, "track_achievements": row.track_achievements}


def build_profile(db: Session, target_steam_id: str, viewer_steam_id: str | None, steam_profile: dict) -> dict:
    """Todo lo que muestra la página de perfil. Quien llama ya verificó `can_view`."""
    from app.services import challenge_service, library_service  # evita la importación circular

    is_me = target_steam_id == viewer_steam_id
    preferences = get_preferences(db, target_steam_id)
    names = _library_names(db, target_steam_id)
    states = db.execute(
        select(GameState).where(GameState.steam_id == target_steam_id).order_by(GameState.updated_at.desc())
    ).scalars().all()
    favorites = db.execute(
        select(FavoriteGame).where(FavoriteGame.steam_id == target_steam_id).order_by(FavoriteGame.created_at.desc())
    ).scalars().all()
    reviews = db.execute(
        select(ForumReview)
        .where(ForumReview.steam_id == target_steam_id)
        .order_by(ForumReview.updated_at.desc())
        .limit(MAX_REVIEWS)
    ).scalars().all()

    wanted_appids = {row.appid for row in states} | {row.appid for row in favorites}
    covers = _covers(db, wanted_appids)
    # Juegos de la biblioteca familiar no están en la suya: buscamos el nombre en otras copias.
    other_names = _names_from_any_library(db, wanted_appids - names.keys())

    def game(appid: int) -> dict:
        return {"appid": appid, "name": names.get(appid) or other_names.get(appid, f"App {appid}"), "header_image": covers.get(appid) or STEAM_HEADER_IMAGE_URL.format(appid=appid)}

    profile = {
        "steam_id": target_steam_id,
        "name": steam_profile.get("name", "Jugador de Steam"),
        "avatar": steam_profile.get("avatar", ""),
        "vanity": steam_profile.get("vanity", ""),
        "is_me": is_me,
        "is_public": bool(preferences and preferences.is_public),
        "is_supporter": target_steam_id in get_settings().supporter_steam_id_set,
        "library_size": len(names),
        "summary": library_service.state_summary(db, target_steam_id),
        "backlog": challenge_service.backlog(db, target_steam_id),
        "challenges": challenge_service.monthly_challenges(db, target_steam_id),
        "playing": [game(row.appid) for row in states if row.state == "playing"][:MAX_GAMES_PER_SECTION],
        "finished": [game(row.appid) for row in states if row.state == "finished"][:MAX_GAMES_PER_SECTION],
        "favorites": [game(row.appid) for row in favorites][:MAX_GAMES_PER_SECTION],
        "reviews": [
            {
                "id": review.id,
                "appid": review.appid,
                "game_name": review.game_name,
                "score": review.score,
                "excerpt": review.body[:220],
                "updated_at": review.updated_at.isoformat() if review.updated_at else None,
            }
            for review in reviews
        ],
    }
    if is_me:
        profile["preferences"] = {
            "is_public": profile["is_public"],
            "track_achievements": bool(preferences and preferences.track_achievements),
        }
    return profile


def delete_user_data(db: Session, steam_id: str) -> dict:
    """Borra todo lo que la página guarda de un usuario: favoritos, ocultos, estados, progreso
    de logros, la copia de su biblioteca y sus mensajes del foro (con sus respuestas y las
    denuncias que recibieron).

    De la fila de perfil solo queda el SteamID y el momento del borrado: sirve para invalidar
    las sesiones que sigan abiertas en otros dispositivos (las cookies firmadas no se pueden
    revocar de otra forma). Las preferencias vuelven a los valores por defecto (privado).
    """
    from app.services.forum_service import refresh_last_activity  # evita la importación circular

    counts = {}
    for name, model in (
        ("favorites", FavoriteGame),
        ("hidden", HiddenGame),
        ("states", GameState),
        ("achievement_progress", UserGameProgress),
        ("library", CachedLibraryEntry),
        ("completion_samples", CompletionSample),
    ):
        counts[name] = db.execute(delete(model).where(model.steam_id == steam_id)).rowcount
    counts["reports_made"] = db.execute(delete(ForumReport).where(ForumReport.reporter_steam_id == steam_id)).rowcount

    thread_ids = list(db.execute(select(ForumThread.id).where(ForumThread.steam_id == steam_id)).scalars())
    own_post_ids = list(db.execute(select(ForumPost.id).where(ForumPost.steam_id == steam_id)).scalars())
    replies_in_own_threads = (
        list(db.execute(select(ForumPost.id).where(ForumPost.thread_id.in_(thread_ids))).scalars()) if thread_ids else []
    )
    review_ids = list(db.execute(select(ForumReview.id).where(ForumReview.steam_id == steam_id)).scalars())
    # Hilos ajenos donde respondió: hay que recalcular su última actividad.
    touched_thread_ids = set(
        db.execute(select(ForumPost.thread_id).where(ForumPost.steam_id == steam_id)).scalars()
    ) - set(thread_ids)

    # Las denuncias apuntan por id: si quedaran, se pegarían a mensajes nuevos que reusen ese id.
    for kind, ids in (
        ("post", set(own_post_ids) | set(replies_in_own_threads)),
        ("thread", set(thread_ids)),
        ("review", set(review_ids)),
    ):
        if ids:
            db.execute(delete(ForumReport).where(ForumReport.kind == kind, ForumReport.target_id.in_(ids)))

    if thread_ids:
        db.execute(delete(ForumPost).where(ForumPost.thread_id.in_(thread_ids)))
    counts["forum_posts"] = db.execute(delete(ForumPost).where(ForumPost.steam_id == steam_id)).rowcount
    counts["forum_threads"] = db.execute(delete(ForumThread).where(ForumThread.steam_id == steam_id)).rowcount
    counts["forum_reviews"] = db.execute(delete(ForumReview).where(ForumReview.steam_id == steam_id)).rowcount
    db.flush()
    for thread in db.execute(select(ForumThread).where(ForumThread.id.in_(touched_thread_ids))).scalars():
        refresh_last_activity(db, thread)

    # Salas en grupo: las suyas se cierran; de las ajenas sale (con sus vetos).
    counts["rooms"] = db.execute(delete(Room).where(Room.host_steam_id == steam_id)).rowcount
    for room in db.execute(select(Room)).scalars():
        if any(member["steam_id"] == steam_id for member in room.members):
            room.members = [member for member in room.members if member["steam_id"] != steam_id]
            room.vetoes = {
                appid: [voter for voter in voters if voter != steam_id]
                for appid, voters in room.vetoes.items()
                if any(voter != steam_id for voter in voters)
            }

    row = get_preferences(db, steam_id)
    if row is None:
        row = UserProfile(steam_id=steam_id)
        db.add(row)
    row.is_public = False
    row.track_achievements = False
    row.sessions_valid_after = int(time.time())
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    return counts


def sessions_valid_after(db: Session, steam_id: str) -> int | None:
    """Momento (epoch) del último borrado de datos: las sesiones emitidas antes ya no valen."""
    row = get_preferences(db, steam_id)
    return row.sessions_valid_after if row else None


def _library_names(db: Session, steam_id: str) -> dict[int, str]:
    rows = db.execute(
        select(CachedLibraryEntry.appid, CachedLibraryEntry.name).where(CachedLibraryEntry.steam_id == steam_id)
    ).all()
    return {appid: name for appid, name in rows}


def _names_from_any_library(db: Session, appids: set[int]) -> dict[int, str]:
    if not appids:
        return {}
    rows = db.execute(
        select(CachedLibraryEntry.appid, CachedLibraryEntry.name).where(CachedLibraryEntry.appid.in_(appids))
    ).all()
    return {appid: name for appid, name in rows if name}


def _covers(db: Session, appids: set[int]) -> dict[int, str]:
    if not appids:
        return {}
    rows = db.execute(
        select(CachedGameDetails.appid, CachedGameDetails.header_image).where(CachedGameDetails.appid.in_(appids))
    ).all()
    return {appid: header for appid, header in rows if header}
