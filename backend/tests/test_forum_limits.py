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
