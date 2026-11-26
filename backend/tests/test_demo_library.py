import re
from pathlib import Path

from app.routers.games import _MOCK_LIBRARY

FRONTEND_DEMO = Path(__file__).resolve().parents[2] / "frontend" / "src" / "services" / "demoGames.js"


def test_demo_library_matches_frontend():
    """El rodillo de ejemplo (frontend) y las fichas de ejemplo (backend) tienen que tener los mismos
    juegos: si no, al frenar en uno que falta, la ficha dice "no está en la biblioteca de ejemplo"."""
    source = FRONTEND_DEMO.read_text(encoding="utf-8")
    block = re.search(r"export const DEMO_GAMES = \[(.*?)\n\];", source, re.S).group(1)
    frontend_appids = {int(appid) for appid in re.findall(r"appid: (\d+)", block)}
    backend_appids = {game.appid for game in _MOCK_LIBRARY}
    assert frontend_appids == backend_appids
    assert len(backend_appids) == len(_MOCK_LIBRARY)  # sin repetidos


async def test_demo_card_shows_the_igdb_duration(db_session, monkeypatch):
    from datetime import datetime, timezone

    from app.core.config import Settings
    from app.models.game import CachedGameDetails
    from app.routers import games
    from app.services import duration_service

    details = CachedGameDetails(
        appid=620, igdb_hours=10.4, igdb_samples=36, igdb_url="https://www.igdb.com/games/portal-2",
        igdb_version=1, fetched_at=datetime.now(timezone.utc),
    )
    db_session.add(details)
    db_session.commit()

    async def cached(db, appid, name):
        return details

    monkeypatch.setattr(games.game_details_service, "get_or_fetch_details", cached)
    monkeypatch.setattr(duration_service, "get_settings", lambda: Settings(igdb_client_id="cliente", igdb_client_secret="secreto"))

    game = await games.get_game_details(appid=620, steamid=None, friend_steamid=None, db=db_session, viewer=None)

    assert (game.duration_hours, game.duration_source, game.duration_samples) == (10.4, "igdb", 36)
    assert game.duration_url == "https://www.igdb.com/games/portal-2"
