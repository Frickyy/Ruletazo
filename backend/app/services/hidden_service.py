"""Juegos ocultos: los que el usuario pidió no volver a ver en la ruleta ("No me lo muestres más")."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.game import HiddenGame


def get_hidden_appids(db: Session, steam_id: str) -> set[int]:
    stmt = select(HiddenGame.appid).where(HiddenGame.steam_id == steam_id)
    return set(db.execute(stmt).scalars().all())


def hide_game(db: Session, steam_id: str, appid: int) -> None:
    if db.get(HiddenGame, (steam_id, appid)) is None:
        db.add(HiddenGame(steam_id=steam_id, appid=appid))
        db.commit()


def unhide_game(db: Session, steam_id: str, appid: int) -> None:
    hidden = db.get(HiddenGame, (steam_id, appid))
    if hidden is not None:
        db.delete(hidden)
        db.commit()
