"""Endpoints del foro: buscador de juegos, reseñas (1 a 10), hilos y respuestas.

Leer es público; publicar, editar y borrar exige haber iniciado sesión con Steam
(cookie firmada, ver core/security.py).
"""

import time

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.security import current_steam_id, require_steam_id
from app.db.session import get_db
from app.services import forum_service
from app.services.forum_service import Author, ForumError
from app.services.steam_client import SteamAPIError, SteamClient
from app.services.store_client import SteamStoreClient, steam_header_image

router = APIRouter(prefix="/api/forum", tags=["forum"])

_CACHE_TTL_SECONDS = 6 * 60 * 60
_game_names: dict[int, tuple[str, float]] = {}
_profiles: dict[str, tuple[Author, float]] = {}


class ReviewIn(BaseModel):
    score: int = Field(ge=forum_service.SCORE_MIN, le=forum_service.SCORE_MAX)
    body: str = Field(min_length=1, max_length=forum_service.REVIEW_MAX_LENGTH)


class ThreadIn(BaseModel):
    title: str = Field(min_length=forum_service.TITLE_MIN_LENGTH, max_length=forum_service.TITLE_MAX_LENGTH)
    body: str = Field(min_length=1, max_length=forum_service.POST_MAX_LENGTH)


class PostIn(BaseModel):
    body: str = Field(min_length=1, max_length=forum_service.POST_MAX_LENGTH)


@router.get("/search")
async def search_games(q: str = Query(..., min_length=2, max_length=80)) -> list[dict]:
    """Busca juegos en la tienda de Steam por nombre."""
    async with SteamStoreClient() as client:
        return await client.search_games(q.strip())


@router.get("/recent")
def recent_activity(db: Session = Depends(get_db)) -> list[dict]:
    """Últimas reseñas e hilos de todo el foro."""
    return forum_service.recent_activity(db)


@router.get("/games/{appid}")
async def game_overview(appid: int, db: Session = Depends(get_db)) -> dict:
    """Cabecera del foro de un juego: nombre, portada, puntaje promedio y cantidad de hilos."""
    name = await _game_name(db, appid)
    return {
        "appid": appid,
        "name": name,
        "header_image": steam_header_image(appid),
        "store_url": f"https://store.steampowered.com/app/{appid}/",
        **forum_service.review_stats(db, appid),
        "thread_count": forum_service.thread_count(db, appid),
    }


@router.get("/games/{appid}/reviews")
def list_reviews(
    appid: int, db: Session = Depends(get_db), viewer: str | None = Depends(current_steam_id)
) -> list[dict]:
    return forum_service.list_reviews(db, appid, viewer)


@router.put("/games/{appid}/reviews")
async def save_review(
    appid: int,
    review: ReviewIn,
    db: Session = Depends(get_db),
    steam_id: str = Depends(require_steam_id),
) -> dict:
    """Crea o reemplaza la reseña del usuario para este juego."""
    name = await _game_name(db, appid)
    author = await _author(steam_id)
    return _unwrap(lambda: forum_service.upsert_review(db, appid, name, author, review.score, review.body))


@router.delete("/games/{appid}/reviews", status_code=204)
def delete_review(appid: int, db: Session = Depends(get_db), steam_id: str = Depends(require_steam_id)) -> None:
    _unwrap(lambda: forum_service.delete_review(db, appid, steam_id))


@router.get("/games/{appid}/threads")
def list_threads(appid: int, db: Session = Depends(get_db)) -> list[dict]:
    return forum_service.list_threads(db, appid)


@router.post("/games/{appid}/threads", status_code=201)
async def create_thread(
    appid: int,
    thread: ThreadIn,
    db: Session = Depends(get_db),
    steam_id: str = Depends(require_steam_id),
) -> dict:
    name = await _game_name(db, appid)
    author = await _author(steam_id)
    return _unwrap(lambda: forum_service.create_thread(db, appid, name, author, thread.title, thread.body))


@router.get("/threads/{thread_id}")
def get_thread(
    thread_id: int, db: Session = Depends(get_db), viewer: str | None = Depends(current_steam_id)
) -> dict:
    return _unwrap(lambda: forum_service.get_thread(db, thread_id, viewer))


@router.delete("/threads/{thread_id}", status_code=204)
def delete_thread(thread_id: int, db: Session = Depends(get_db), steam_id: str = Depends(require_steam_id)) -> None:
    _unwrap(lambda: forum_service.delete_thread(db, thread_id, steam_id))


@router.post("/threads/{thread_id}/posts", status_code=201)
async def add_post(
    thread_id: int,
    post: PostIn,
    db: Session = Depends(get_db),
    steam_id: str = Depends(require_steam_id),
) -> dict:
    author = await _author(steam_id)
    return _unwrap(lambda: forum_service.add_post(db, thread_id, author, post.body))


@router.delete("/posts/{post_id}", status_code=204)
def delete_post(post_id: int, db: Session = Depends(get_db), steam_id: str = Depends(require_steam_id)) -> None:
    _unwrap(lambda: forum_service.delete_post(db, post_id, steam_id))


def _unwrap(action):
    try:
        return action()
    except ForumError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


async def _game_name(db: Session, appid: int) -> str:
    """Nombre del juego: caché en memoria → tienda de Steam → mensajes ya guardados. 404 si no existe."""
    cached = _game_names.get(appid)
    if cached and time.monotonic() - cached[1] < _CACHE_TTL_SECONDS:
        return cached[0]
    async with SteamStoreClient() as client:
        details = await client.get_app_details(appid)
    name = details.get("name") or forum_service.known_game_name(db, appid)
    if not name:
        raise HTTPException(status_code=404, detail="No encontramos ese juego en la tienda de Steam.")
    _game_names[appid] = (name, time.monotonic())
    return name


async def _author(steam_id: str) -> Author:
    """Nombre y avatar de Steam de quien publica (se guardan junto al mensaje)."""
    cached = _profiles.get(steam_id)
    if cached and time.monotonic() - cached[1] < _CACHE_TTL_SECONDS:
        return cached[0]
    try:
        async with SteamClient() as client:
            profile = await client.get_profile(steam_id)
        author = Author(steam_id=steam_id, name=profile["name"], avatar=profile["avatar"])
    except SteamAPIError:
        author = Author(steam_id=steam_id, name="Jugador de Steam")
    _profiles[steam_id] = (author, time.monotonic())
    return author
