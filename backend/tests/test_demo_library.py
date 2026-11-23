import re
from pathlib import Path

from app.routers.games import _MOCK_LIBRARY

FRONTEND_ROULETTE = Path(__file__).resolve().parents[2] / "frontend" / "src" / "pages" / "RoulettePage.jsx"


def test_demo_library_matches_frontend():
    """El rodillo de ejemplo (frontend) y las fichas de ejemplo (backend) tienen que tener los mismos
    juegos: si no, al frenar en uno que falta, la ficha dice "no está en la biblioteca de ejemplo"."""
    source = FRONTEND_ROULETTE.read_text(encoding="utf-8")
    block = re.search(r"const DEMO_GAMES = \[(.*?)\n\];", source, re.S).group(1)
    frontend_appids = {int(appid) for appid in re.findall(r"appid: (\d+)", block)}
    backend_appids = {game.appid for game in _MOCK_LIBRARY}
    assert frontend_appids == backend_appids
    assert len(backend_appids) == len(_MOCK_LIBRARY)  # sin repetidos
