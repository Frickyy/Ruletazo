from datetime import date, timedelta

from app.models.game import CachedLibraryEntry
from app.routers.games import _MOCK_LIBRARY, build_daily_game, daily_pick


def test_daily_game_is_the_same_all_day_and_rotates():
    day = date(2026, 11, 23)
    assert daily_pick(day) == daily_pick(day)
    picks = [daily_pick(day + timedelta(days=i)).appid for i in range(len(_MOCK_LIBRARY))]
    assert len(set(picks)) == len(_MOCK_LIBRARY)  # pasa por todos antes de repetir


def test_daily_game_counts_owners_without_exposing_them(db_session):
    day = date(2026, 11, 23)
    appid = daily_pick(day).appid
    for steam_id in ("1", "2", "3"):
        db_session.add(CachedLibraryEntry(steam_id=steam_id, appid=appid, name="x", playtime_forever_minutes=0))
    db_session.add(CachedLibraryEntry(steam_id="4", appid=appid + 1, name="otro", playtime_forever_minutes=0))
    db_session.commit()
    daily = build_daily_game(db_session, day)
    assert daily.appid == appid
    assert daily.owners == 3
    assert "steam_id" not in daily.model_dump()
