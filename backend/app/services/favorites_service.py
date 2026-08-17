"""Favoritos: juegos que un usuario marcó para priorizarlos en la colección "Favoritos" de la ruleta."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.game import FavoriteGame


def get_favorite_appids(db: Session, steam_id: str) -> set[int]:
    stmt = select(FavoriteGame.appid).where(FavoriteGame.steam_id == steam_id)
    return set(db.execute(stmt).scalars().all())


def add_favorite(db: Session, steam_id: str, appid: int) -> None:
    if db.get(FavoriteGame, (steam_id, appid)) is None:
        db.add(FavoriteGame(steam_id=steam_id, appid=appid))
        db.commit()


def remove_favorite(db: Session, steam_id: str, appid: int) -> None:
    favorite = db.get(FavoriteGame, (steam_id, appid))
    if favorite is not None:
        db.delete(favorite)
        db.commit()
