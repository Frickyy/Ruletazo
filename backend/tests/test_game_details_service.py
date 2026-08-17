from datetime import datetime, timedelta, timezone

from app.models.game import CachedGameDetails
from app.services import game_details_service


def _make_details(**overrides) -> CachedGameDetails:
    defaults = dict(
        appid=10,
        genres=[],
        short_description="",
        review_score_desc="",
        review_total=0,
        review_positive=0,
        featured_reviews=[],
        hltb_main_hours=None,
        hltb_completionist_hours=None,
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
