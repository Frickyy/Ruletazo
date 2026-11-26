from datetime import datetime, timedelta, timezone

from app.models.game import CachedGameDetails
from app.services import game_details_service, library_service


def _make_details(**overrides) -> CachedGameDetails:
    defaults = dict(
        appid=10,
        genres=[],
        short_description="",
        review_score_desc="",
        review_total=0,
        review_positive=0,
        featured_reviews=[],
        achievement_total=0,
        achievement_avg_percent=None,
        fetched_at=datetime.now(timezone.utc),
    )
    defaults.update(overrides)
    return CachedGameDetails(**defaults)


def test_difficulty_label_without_achievements():
    assert game_details_service.difficulty_label(_make_details(achievement_total=0)) == "Sin logros"


def test_difficulty_label_easy():
    details = _make_details(achievement_total=10, achievement_avg_percent=75.0)
    assert game_details_service.difficulty_label(details) == "Fácil"


def test_difficulty_label_medium():
    details = _make_details(achievement_total=10, achievement_avg_percent=35.0)
    assert game_details_service.difficulty_label(details) == "Media"


def test_difficulty_label_hard():
    details = _make_details(achievement_total=10, achievement_avg_percent=5.0)
    assert game_details_service.difficulty_label(details) == "Difícil"


def test_is_fresh_within_ttl():
    details = _make_details(fetched_at=datetime.now(timezone.utc) - timedelta(days=1))
    assert game_details_service.is_fresh(details) is True


def test_is_fresh_expired_ttl():
    details = _make_details(fetched_at=datetime.now(timezone.utc) - timedelta(days=8))
    assert game_details_service.is_fresh(details) is False


def test_old_cache_row_is_missing_store_metadata():
    details = _make_details(store_metadata_version=0)
    assert game_details_service.has_store_metadata(details) is False


def test_current_cache_row_has_store_metadata_even_when_free_or_undated():
    details = _make_details(
        store_metadata_version=game_details_service.STORE_METADATA_VERSION, price_cents=0, release_date=""
    )
    assert game_details_service.has_store_metadata(details) is True


def test_expired_row_with_current_metadata_still_counts_as_classified():
    details = _make_details(
        store_metadata_version=game_details_service.STORE_METADATA_VERSION,
        fetched_at=datetime.now(timezone.utc) - timedelta(days=30),
    )
    assert library_service._is_classified(details) is True


def test_missing_or_outdated_row_is_not_classified():
    assert library_service._is_classified(None) is False
    assert library_service._is_classified(_make_details(store_metadata_version=0)) is False


def _complete_details(**overrides):
    defaults = dict(
        store_metadata_version=game_details_service.STORE_METADATA_VERSION,
        reviews_version=game_details_service.REVIEWS_VERSION,
        igdb_version=game_details_service.IGDB_VERSION,
    )
    defaults.update(overrides)
    return _make_details(**defaults)


def _track_fetches(monkeypatch):
    calls = []

    def fake(name, result):
        async def fetch(*args):
            calls.append(name)
            return result

        return fetch

    monkeypatch.setattr(game_details_service, "_fetch_app_details", fake("store", {"fetch_failed": True}))
    monkeypatch.setattr(
        game_details_service,
        "_fetch_reviews",
        fake("reviews", {"failed": False, "good": ["Bien"], "bad": []}),
    )
    monkeypatch.setattr(game_details_service, "_fetch_achievements", fake("achievements", {"total": 0, "average_percent": None}))
    monkeypatch.setattr(
        game_details_service.igdb_client,
        "get_times",
        fake("igdb", {10: {"hours": 10.4, "samples": 36, "url": "https://www.igdb.com/games/portal-2"}}),
    )
    return calls


def _reviews_on(monkeypatch):
    from app.core.config import Settings

    monkeypatch.setattr(game_details_service, "get_settings", lambda: Settings(review_highlights_enabled=True))


async def test_steam_reviews_are_not_asked_while_they_are_off(db_session, monkeypatch):
    # Steam redirige /appreviews a su portada: apagado, ni la ficha vencida ni la que no las tiene las piden.
    db_session.add(_complete_details(fetched_at=datetime.now(timezone.utc) - timedelta(days=30)))
    db_session.add(_complete_details(appid=11, reviews_version=0))
    db_session.commit()
    calls = _track_fetches(monkeypatch)

    await game_details_service.get_or_fetch_details(db_session, 10, "Juego")
    await game_details_service.get_or_fetch_details(db_session, 11, "Otro")

    assert sorted(calls) == ["achievements", "store"]


async def test_only_missing_reviews_are_fetched(db_session, monkeypatch):
    _reviews_on(monkeypatch)
    db_session.add(_complete_details(reviews_version=0, review_score_desc="Muy positivas", review_total=94499))
    db_session.commit()
    calls = _track_fetches(monkeypatch)

    details = await game_details_service.get_or_fetch_details(db_session, 10, "Juego")

    assert calls == ["reviews"]
    assert details.review_pros == "Bien"
    # Las frases no pisan el puntaje ni el total, que vienen de la tienda.
    assert (details.review_score_desc, details.review_total) == ("Muy positivas", 94499)


async def test_nothing_is_fetched_while_reviews_are_rate_limited(db_session, monkeypatch):
    from app.services import throttle

    _reviews_on(monkeypatch)
    db_session.add(_complete_details(reviews_version=0))
    db_session.commit()
    calls = _track_fetches(monkeypatch)
    throttle.cool_down("reviews")

    await game_details_service.get_or_fetch_details(db_session, 10, "Juego")

    assert calls == []


async def test_expired_details_refresh_every_part(db_session, monkeypatch):
    _reviews_on(monkeypatch)
    db_session.add(_complete_details(fetched_at=datetime.now(timezone.utc) - timedelta(days=30)))
    db_session.commit()
    calls = _track_fetches(monkeypatch)

    await game_details_service.get_or_fetch_details(db_session, 10, "Juego")

    assert sorted(calls) == ["achievements", "reviews", "store"]


async def test_igdb_duration_is_looked_up_once_and_kept(db_session, monkeypatch):
    monkeypatch.setattr(game_details_service.igdb_client, "enabled", lambda: True)
    db_session.add(_complete_details(igdb_version=0))
    db_session.commit()
    calls = _track_fetches(monkeypatch)

    details = await game_details_service.get_or_fetch_details(db_session, 10, "Portal 2")
    assert calls == ["igdb"]
    assert (details.igdb_hours, details.igdb_samples, details.igdb_url) == (10.4, 36, "https://www.igdb.com/games/portal-2")

    await game_details_service.get_or_fetch_details(db_session, 10, "Portal 2")
    assert calls == ["igdb"]  # ya buscado: no se vuelve a pedir


async def test_igdb_failure_is_retried_later(db_session, monkeypatch):
    async def failed(appids):
        return None

    monkeypatch.setattr(game_details_service.igdb_client, "enabled", lambda: True)
    db_session.add(_complete_details(igdb_version=0, igdb_hours=12.0))
    db_session.commit()
    _track_fetches(monkeypatch)
    monkeypatch.setattr(game_details_service.igdb_client, "get_times", failed)

    details = await game_details_service.get_or_fetch_details(db_session, 10, "Juego")

    assert details.igdb_hours == 12.0  # no se borra lo que había
    assert game_details_service.has_igdb_lookup(details) is False


async def test_igdb_is_not_asked_without_keys(db_session, monkeypatch):
    monkeypatch.setattr(game_details_service.igdb_client, "enabled", lambda: False)
    db_session.add(_complete_details(igdb_version=0))
    db_session.commit()
    calls = _track_fetches(monkeypatch)

    await game_details_service.get_or_fetch_details(db_session, 10, "Juego")

    assert calls == []
