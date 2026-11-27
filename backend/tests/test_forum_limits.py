import pytest
from fastapi import HTTPException

from app.routers import forum


def test_post_rate_limit_blocks_after_limit_and_recovers(monkeypatch):
    monkeypatch.setattr(forum, "_recent_posts", {})
    for second in range(forum.POST_LIMIT):
        forum.check_post_rate("user", now=float(second))

    with pytest.raises(HTTPException) as exc_info:
        forum.check_post_rate("user", now=float(forum.POST_LIMIT))
    assert exc_info.value.status_code == 429

    forum.check_post_rate("user", now=forum.POST_WINDOW_SECONDS + 100.0)


def test_cache_is_bounded(monkeypatch):
    monkeypatch.setattr(forum, "_CACHE_MAX_ENTRIES", 3)
    cache = {}
    for key in range(5):
        forum._cache_put(cache, key, f"juego {key}")

    assert list(cache) == [2, 3, 4]


async def test_game_info_has_what_the_roulette_card_shows(db_session, monkeypatch):
    from datetime import datetime, timezone

    from app.models.game import CachedGameDetails
    from app.services import game_details_service

    async def fake_name(db, appid):
        return "Portal 2"

    details = CachedGameDetails(
        appid=620,
        genres=["Puzles"],
        short_description="Pensá con portales.",
        developer="Valve",
        review_score_desc="Extremadamente positivas",
        review_total=400,
        review_positive=392,
        featured_reviews=[],
        achievement_total=0,
        metacritic_score=95,
        metacritic_url="https://www.metacritic.com/game/pc/portal-2",
        store_metadata_version=game_details_service.STORE_METADATA_VERSION,
        fetched_at=datetime.now(timezone.utc),
    )

    async def fake_details(db, appid, name):
        return details

    monkeypatch.setattr(forum, "_game_name", fake_name)
    monkeypatch.setattr(game_details_service, "get_or_fetch_details", fake_details)

    game = await forum.game_info(620, db=db_session, viewer=None)

    assert (game.name, game.developer, game.short_description) == ("Portal 2", "Valve", "Pensá con portales.")
    assert game.review_score_desc == "Extremadamente positivas"
    assert [critic.source for critic in game.critics] == ["metacritic", "steam"]
    # Es la ficha general del juego: nada de la biblioteca de nadie.
    assert (game.playtime_forever_minutes, game.is_favorite, game.state) == (0, False, None)

    # Con sesión viene tu estado en el juego, para poder cambiarlo o sacarlo desde el foro.
    from app.services import library_service

    library_service.set_state(db_session, "76561198000000001", 620, "playing")
    mine = await forum.game_info(620, db=db_session, viewer="76561198000000001")
    assert mine.state == "playing"
