"""Lógica del foro: reseñas (1 a 10), hilos y respuestas, guardados en la base local.

Este módulo solo habla con la base de datos; nombres de juegos y perfiles de Steam se
resuelven en el router, así esta lógica se puede testear sin red.
"""

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models.forum import ForumPost, ForumReport, ForumReview, ForumThread

SCORE_MIN = 1
SCORE_MAX = 10
REVIEW_MAX_LENGTH = 5000
POST_MAX_LENGTH = 5000
TITLE_MIN_LENGTH = 3
TITLE_MAX_LENGTH = 120
REPORT_REASON_MAX_LENGTH = 300
REPORT_KINDS = ("review", "thread", "post")


class ForumError(Exception):
    """Error de validación o de permisos del foro (el router lo traduce a HTTP)."""

    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class Author:
    steam_id: str
    name: str
    avatar: str = ""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def _clean_text(value: str, field: str, max_length: int, min_length: int = 1) -> str:
    text = (value or "").strip()
    if len(text) < min_length:
        raise ForumError(f"{field} no puede estar vacío." if min_length == 1 else f"{field} es muy corto.")
    if len(text) > max_length:
        raise ForumError(f"{field} supera los {max_length} caracteres.")
    return text


# ---------- Reseñas ----------


def review_stats(db: Session, appid: int) -> dict:
    count, average = db.execute(
        select(func.count(ForumReview.id), func.avg(ForumReview.score)).where(ForumReview.appid == appid)
    ).one()
    return {"review_count": count, "average_score": round(float(average), 1) if average is not None else None}


def list_reviews(db: Session, appid: int, viewer_steam_id: str | None = None) -> list[dict]:
    reviews = db.execute(
        select(ForumReview).where(ForumReview.appid == appid).order_by(ForumReview.updated_at.desc())
    ).scalars()
    return [_review_dict(review, viewer_steam_id) for review in reviews]


def upsert_review(db: Session, appid: int, game_name: str, author: Author, score: int, body: str) -> dict:
    """Crea la reseña del usuario para el juego, o la reemplaza si ya tenía una."""
    if not isinstance(score, int) or not SCORE_MIN <= score <= SCORE_MAX:
        raise ForumError(f"El puntaje tiene que ser un número del {SCORE_MIN} al {SCORE_MAX}.")
    text = _clean_text(body, "La reseña", REVIEW_MAX_LENGTH)

    review = db.execute(
        select(ForumReview).where(ForumReview.appid == appid, ForumReview.steam_id == author.steam_id)
    ).scalar_one_or_none()
    if review is None:
        review = ForumReview(appid=appid, steam_id=author.steam_id, created_at=_now())
        db.add(review)
    review.game_name = game_name
    review.author_name = author.name
    review.author_avatar = author.avatar
    review.score = score
    review.body = text
    review.updated_at = _now()
    db.commit()
    db.refresh(review)
    return _review_dict(review, author.steam_id)


def delete_review(db: Session, appid: int, steam_id: str) -> None:
    review = db.execute(
        select(ForumReview).where(ForumReview.appid == appid, ForumReview.steam_id == steam_id)
    ).scalar_one_or_none()
    if review is None:
        raise ForumError("No tenés una reseña de este juego.", status_code=404)
    _delete_reports(db, "review", review.id)
    db.delete(review)
    db.commit()


def delete_review_by_id(db: Session, review_id: int, steam_id: str, moderator: bool = False) -> None:
    """Borra una reseña puntual: la propia, o cualquiera si es moderador."""
    review = db.get(ForumReview, review_id)
    if review is None:
        raise ForumError("Esa reseña no existe.", status_code=404)
    if review.steam_id != steam_id and not moderator:
        raise ForumError("Solo quien escribió la reseña o un moderador puede borrarla.", status_code=403)
    _delete_reports(db, "review", review.id)
    db.delete(review)
    db.commit()


def _review_dict(review: ForumReview, viewer_steam_id: str | None) -> dict:
    return {
        "id": review.id,
        "appid": review.appid,
        "game_name": review.game_name,
        "author": {"steam_id": review.steam_id, "name": review.author_name, "avatar": review.author_avatar},
        "score": review.score,
        "body": review.body,
        "created_at": _iso(review.created_at),
        "updated_at": _iso(review.updated_at),
        "is_mine": viewer_steam_id == review.steam_id,
    }


# ---------- Hilos y respuestas ----------


def thread_count(db: Session, appid: int) -> int:
    return db.execute(select(func.count(ForumThread.id)).where(ForumThread.appid == appid)).scalar_one()


def list_threads(db: Session, appid: int) -> list[dict]:
    reply_counts = (
        select(ForumPost.thread_id, func.count(ForumPost.id).label("replies")).group_by(ForumPost.thread_id).subquery()
    )
    rows = db.execute(
        select(ForumThread, func.coalesce(reply_counts.c.replies, 0))
        .outerjoin(reply_counts, reply_counts.c.thread_id == ForumThread.id)
        .where(ForumThread.appid == appid)
        .order_by(ForumThread.last_activity_at.desc())
    ).all()
    return [_thread_dict(thread, replies) for thread, replies in rows]


def create_thread(db: Session, appid: int, game_name: str, author: Author, title: str, body: str) -> dict:
    clean_title = _clean_text(title, "El título", TITLE_MAX_LENGTH, TITLE_MIN_LENGTH)
    clean_body = _clean_text(body, "El mensaje", POST_MAX_LENGTH)
    now = _now()
    thread = ForumThread(
        appid=appid,
        game_name=game_name,
        steam_id=author.steam_id,
        author_name=author.name,
        author_avatar=author.avatar,
        title=clean_title,
        body=clean_body,
        created_at=now,
        last_activity_at=now,
    )
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return _thread_dict(thread, 0)


def get_thread(db: Session, thread_id: int, viewer_steam_id: str | None = None) -> dict:
    thread = db.get(ForumThread, thread_id)
    if thread is None:
        raise ForumError("Ese hilo no existe.", status_code=404)
    posts = db.execute(
        select(ForumPost).where(ForumPost.thread_id == thread_id).order_by(ForumPost.created_at.asc())
    ).scalars().all()
    data = _thread_dict(thread, len(posts))
    data["is_mine"] = viewer_steam_id == thread.steam_id
    data["posts"] = [_post_dict(post, viewer_steam_id) for post in posts]
    return data


def add_post(db: Session, thread_id: int, author: Author, body: str) -> dict:
    thread = db.get(ForumThread, thread_id)
    if thread is None:
        raise ForumError("Ese hilo no existe.", status_code=404)
    post = ForumPost(
        thread_id=thread_id,
        steam_id=author.steam_id,
        author_name=author.name,
        author_avatar=author.avatar,
        body=_clean_text(body, "La respuesta", POST_MAX_LENGTH),
        created_at=_now(),
    )
    db.add(post)
    thread.last_activity_at = post.created_at
    db.commit()
    db.refresh(post)
    return _post_dict(post, author.steam_id)


def edit_thread(db: Session, thread_id: int, steam_id: str, title: str, body: str) -> dict:
    """Solo quien creó el hilo puede editarlo (los moderadores pueden borrarlo, no reescribirlo)."""
    thread = db.get(ForumThread, thread_id)
    if thread is None:
        raise ForumError("Ese hilo no existe.", status_code=404)
    if thread.steam_id != steam_id:
        raise ForumError("Solo quien creó el hilo puede editarlo.", status_code=403)
    thread.title = _clean_text(title, "El título", TITLE_MAX_LENGTH, TITLE_MIN_LENGTH)
    thread.body = _clean_text(body, "El mensaje", POST_MAX_LENGTH)
    thread.edited_at = _now()
    db.commit()
    return get_thread(db, thread_id, steam_id)


def edit_post(db: Session, post_id: int, steam_id: str, body: str) -> dict:
    post = db.get(ForumPost, post_id)
    if post is None:
        raise ForumError("Esa respuesta no existe.", status_code=404)
    if post.steam_id != steam_id:
        raise ForumError("Solo quien escribió la respuesta puede editarla.", status_code=403)
    post.body = _clean_text(body, "La respuesta", POST_MAX_LENGTH)
    post.edited_at = _now()
    db.commit()
    db.refresh(post)
    return _post_dict(post, steam_id)


def delete_thread(db: Session, thread_id: int, steam_id: str, moderator: bool = False) -> None:
    thread = db.get(ForumThread, thread_id)
    if thread is None:
        raise ForumError("Ese hilo no existe.", status_code=404)
    if thread.steam_id != steam_id and not moderator:
        raise ForumError("Solo quien creó el hilo o un moderador puede borrarlo.", status_code=403)
    for post in db.execute(select(ForumPost).where(ForumPost.thread_id == thread_id)).scalars():
        _delete_reports(db, "post", post.id)
        db.delete(post)
    _delete_reports(db, "thread", thread.id)
    db.delete(thread)
    db.commit()


def delete_post(db: Session, post_id: int, steam_id: str, moderator: bool = False) -> None:
    post = db.get(ForumPost, post_id)
    if post is None:
        raise ForumError("Esa respuesta no existe.", status_code=404)
    if post.steam_id != steam_id and not moderator:
        raise ForumError("Solo quien escribió la respuesta o un moderador puede borrarla.", status_code=403)
    _delete_reports(db, "post", post.id)
    db.delete(post)
    db.commit()


def _thread_dict(thread: ForumThread, replies: int) -> dict:
    return {
        "id": thread.id,
        "appid": thread.appid,
        "game_name": thread.game_name,
        "author": {"steam_id": thread.steam_id, "name": thread.author_name, "avatar": thread.author_avatar},
        "title": thread.title,
        "body": thread.body,
        "reply_count": replies,
        "created_at": _iso(thread.created_at),
        "edited_at": _iso(thread.edited_at) if thread.edited_at else None,
        "last_activity_at": _iso(thread.last_activity_at),
    }


def _post_dict(post: ForumPost, viewer_steam_id: str | None) -> dict:
    return {
        "id": post.id,
        "thread_id": post.thread_id,
        "author": {"steam_id": post.steam_id, "name": post.author_name, "avatar": post.author_avatar},
        "body": post.body,
        "created_at": _iso(post.created_at),
        "edited_at": _iso(post.edited_at) if post.edited_at else None,
        "is_mine": viewer_steam_id == post.steam_id,
    }


# ---------- Portada del foro ----------


def known_game_name(db: Session, appid: int) -> str:
    """Nombre del juego guardado en algún mensaje del foro (respaldo si la tienda no responde)."""
    for model in (ForumThread, ForumReview):
        name = db.execute(
            select(model.game_name).where(model.appid == appid, model.game_name != "").limit(1)
        ).scalar_one_or_none()
        if name:
            return name
    return ""


def recent_activity(db: Session, limit: int = 12) -> list[dict]:
    """Últimas reseñas e hilos de todo el foro, mezclados por fecha."""
    reviews = db.execute(select(ForumReview).order_by(ForumReview.updated_at.desc()).limit(limit)).scalars()
    threads = db.execute(select(ForumThread).order_by(ForumThread.last_activity_at.desc()).limit(limit)).scalars()
    items = [
        {
            "kind": "review",
            "appid": review.appid,
            "game_name": review.game_name,
            "author": {"steam_id": review.steam_id, "name": review.author_name, "avatar": review.author_avatar},
            "score": review.score,
            "excerpt": review.body[:180],
            "at": _iso(review.updated_at),
        }
        for review in reviews
    ] + [
        {
            "kind": "thread",
            "appid": thread.appid,
            "game_name": thread.game_name,
            "thread_id": thread.id,
            "title": thread.title,
            "author": {"steam_id": thread.steam_id, "name": thread.author_name, "avatar": thread.author_avatar},
            "at": _iso(thread.last_activity_at),
        }
        for thread in threads
    ]
    items.sort(key=lambda item: item["at"], reverse=True)
    return items[:limit]


# ---------- Denuncias (moderación) ----------


def report(db: Session, kind: str, target_id: int, reporter_steam_id: str, reason: str) -> None:
    """Denuncia un mensaje. Denunciar dos veces lo mismo no duplica la denuncia."""
    if kind not in REPORT_KINDS:
        raise ForumError("Tipo de mensaje inválido.")
    target = _report_target(db, kind, target_id)
    if target is None:
        raise ForumError("Ese mensaje ya no existe.", status_code=404)
    if target.steam_id == reporter_steam_id:
        raise ForumError("No podés denunciar un mensaje tuyo.")
    text = (reason or "").strip()[:REPORT_REASON_MAX_LENGTH]
    existing = db.execute(
        select(ForumReport).where(
            ForumReport.kind == kind,
            ForumReport.target_id == target_id,
            ForumReport.reporter_steam_id == reporter_steam_id,
        )
    ).scalar_one_or_none()
    if existing is None:
        db.add(
            ForumReport(
                kind=kind, target_id=target_id, reporter_steam_id=reporter_steam_id, reason=text, created_at=_now()
            )
        )
        db.commit()


def list_reports(db: Session) -> list[dict]:
    """Mensajes denunciados, agrupados: el más denunciado primero. Solo para moderadores."""
    grouped: dict[tuple[str, int], dict] = {}
    for item in db.execute(select(ForumReport).order_by(ForumReport.created_at.desc())).scalars():
        key = (item.kind, item.target_id)
        if key not in grouped:
            target = _report_target(db, item.kind, item.target_id)
            if target is None:
                continue
            grouped[key] = {
                "kind": item.kind,
                "target_id": item.target_id,
                "report_count": 0,
                "reasons": [],
                "last_reported_at": _iso(item.created_at),
                **_report_context(db, item.kind, target),
            }
        grouped[key]["report_count"] += 1
        if item.reason:
            grouped[key]["reasons"].append(item.reason)
    return sorted(grouped.values(), key=lambda entry: entry["report_count"], reverse=True)


def dismiss_reports(db: Session, kind: str, target_id: int) -> None:
    """El moderador revisó el mensaje y lo deja: se descartan sus denuncias."""
    _delete_reports(db, kind, target_id)
    db.commit()


def _delete_reports(db: Session, kind: str, target_id: int) -> None:
    db.execute(delete(ForumReport).where(ForumReport.kind == kind, ForumReport.target_id == target_id))


def _report_target(db: Session, kind: str, target_id: int):
    model = {"review": ForumReview, "thread": ForumThread, "post": ForumPost}[kind]
    return db.get(model, target_id)


def _report_context(db: Session, kind: str, target) -> dict:
    """Lo que el moderador necesita ver: autor, texto y dónde está el mensaje."""
    if kind == "post":
        thread = db.get(ForumThread, target.thread_id)
        appid, game_name, thread_id = (thread.appid, thread.game_name, thread.id) if thread else (None, "", None)
    else:
        appid, game_name = target.appid, target.game_name
        thread_id = target.id if kind == "thread" else None
    prefix = f"{target.title} — " if kind == "thread" else ""
    return {
        "appid": appid,
        "game_name": game_name,
        "thread_id": thread_id,
        "author": {"steam_id": target.steam_id, "name": target.author_name, "avatar": target.author_avatar},
        "excerpt": prefix + target.body[:280],
    }
