"""Perfiles, privacidad, juegos en común, configuración pública y monetización."""

from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.core.config import Settings
from app.models.game import CachedLibraryEntry
from app.routers import profiles
from app.services import favorites_service, forum_service, library_service, profile_service
from app.services.forum_service import Author

ANA = "76561198000000001"
BETO = "76561198000000002"


def _library(db, steam_id, *games):
    for appid, name in games:
        db.add(CachedLibraryEntry(steam_id=steam_id, appid=appid, name=name, playtime_forever_minutes=0, fetched_at=datetime.now(timezone.utc)))
    db.commit()


# ---------- Privacidad ----------


def test_profiles_are_private_by_default(db_session):
    assert profile_service.can_view(db_session, ANA, ANA) is True
    assert profile_service.can_view(db_session, ANA, BETO) is False
    assert profile_service.can_view(db_session, ANA, None) is False

    profile_service.update_preferences(db_session, ANA, is_public=True)

    assert profile_service.can_view(db_session, ANA, BETO) is True
    assert profile_service.can_view(db_session, ANA, None) is True


def test_achievement_tracking_is_opt_in(db_session):
    assert profile_service.tracks_achievements(db_session, ANA) is False
    profile_service.update_preferences(db_session, ANA, track_achievements=True)
    assert profile_service.tracks_achievements(db_session, ANA) is True
    # Cambiar una preferencia no toca la otra.
    assert profile_service.is_public(db_session, ANA) is False


# ---------- Contenido del perfil ----------


def test_build_profile_collects_states_favorites_and_reviews(db_session):
    _library(db_session, ANA, (10, "Hades"), (20, "Celeste"), (30, "Portal 2"))
    library_service.set_state(db_session, ANA, 10, "playing")
    library_service.set_state(db_session, ANA, 20, "finished")
    favorites_service.add_favorite(db_session, ANA, 30)
    forum_service.upsert_review(db_session, 30, "Portal 2", Author(steam_id=ANA, name="Ana"), 10, "Una obra maestra.")

    profile = profile_service.build_profile(db_session, ANA, ANA, {"name": "Ana", "avatar": "a.jpg"})

    assert profile["name"] == "Ana"
    assert profile["is_me"] is True
    assert profile["library_size"] == 3
    assert [game["name"] for game in profile["playing"]] == ["Hades"]
    assert [game["name"] for game in profile["finished"]] == ["Celeste"]
    assert [game["name"] for game in profile["favorites"]] == ["Portal 2"]
    assert profile["reviews"][0]["score"] == 10
    assert profile["summary"]["counts"]["finished"] == 1
    assert profile["preferences"] == {"is_public": False, "track_achievements": False}


def test_other_people_do_not_see_preferences(db_session):
    profile_service.update_preferences(db_session, ANA, is_public=True)
    profile = profile_service.build_profile(db_session, ANA, BETO, {"name": "Ana"})
    assert profile["is_me"] is False
    assert "preferences" not in profile


# ---------- Juegos en común ----------


async def test_games_in_common_respects_privacy(db_session, monkeypatch):
    _library(db_session, ANA, (10, "Hades"), (620, "Portal 2"))
    _library(db_session, BETO, (620, "Portal 2"), (99, "Otro"))

    async def fake_resolve(identifier):
        return identifier

    async def fake_library(db, identifier):
        return library_service._to_schema_list(library_service._get_cached_entries(db, identifier))

    monkeypatch.setattr(library_service, "resolve_steam_id", fake_resolve)
    monkeypatch.setattr(library_service, "get_library", fake_library)

    with pytest.raises(HTTPException) as exc_info:
        await profiles.games_in_common(BETO, db=db_session, viewer=ANA)
    assert exc_info.value.status_code == 404  # privado

    profile_service.update_preferences(db_session, BETO, is_public=True)
    common = await profiles.games_in_common(BETO, db=db_session, viewer=ANA)

    assert [game.name for game in common] == ["Portal 2"]
    assert common[0].source == "both"


# ---------- Configuración y monetización ----------


def test_named_url_settings_only_accept_https():
    settings = Settings(
        support_links="Cafecito|https://cafecito.app/x, Malo|http://inseguro.com, |https://sin-nombre.com",
        affiliate_stores="Humble|https://www.humblebundle.com/store/search?search={query}&partner=yo,SinQuery|https://x.com",
    )
    assert settings.support_link_list == [{"name": "Cafecito", "url": "https://cafecito.app/x"}]
    assert settings.affiliate_store_list == [
        {"name": "Humble", "url": "https://www.humblebundle.com/store/search?search={query}&partner=yo"}
    ]


def test_public_config(monkeypatch):
    monkeypatch.setattr(
        profiles, "get_settings", lambda: Settings(support_links="Ko-fi|https://ko-fi.com/x", hltb_enabled=False)
    )
    config = profiles.public_config()
    assert config["support_links"] == [{"name": "Ko-fi", "url": "https://ko-fi.com/x"}]
    assert config["hltb_enabled"] is False


def test_forum_authors_carry_supporter_badge(db_session, monkeypatch):
    monkeypatch.setattr(forum_service, "get_settings", lambda: Settings(supporter_steam_ids=ANA))
    forum_service.upsert_review(db_session, 1, "Juego", Author(steam_id=ANA, name="Ana"), 8, "Bueno")
    forum_service.upsert_review(db_session, 1, "Juego", Author(steam_id=BETO, name="Beto"), 6, "Normal")

    authors = {review["author"]["name"]: review["author"]["is_supporter"] for review in forum_service.list_reviews(db_session, 1)}

    assert authors == {"Ana": True, "Beto": False}


async def test_enrich_skips_hltb_when_disabled_and_progress_without_opt_in(db_session, monkeypatch):
    from app.services import store_browse

    _library(db_session, ANA, (620, "Portal 2"))
    db_session.query(CachedLibraryEntry).update({"playtime_forever_minutes": 300})
    db_session.commit()
    calls = []

    async def fake_resolve(identifier):
        return ANA

    async def fake_items(appids):
        return {620: store_browse.parse_item({"appid": 620, "success": 1, "type": 0, "name": "Portal 2"})}

    async def fake_hltb(name):
        calls.append("hltb")
        return {"main_hours": 1, "completionist_hours": 2}

    monkeypatch.setattr(library_service, "resolve_steam_id", fake_resolve)
    monkeypatch.setattr(library_service.store_browse, "get_items", fake_items)
    monkeypatch.setattr(library_service.hltb_client, "get_completion_times", fake_hltb)
    monkeypatch.setattr(library_service, "get_settings", lambda: Settings(hltb_enabled=False))
    await library_service.classify_library_batch(db_session, ANA, limit=100)

    result = await library_service.enrich_library_batch(db_session, ANA, limit=5)

    assert calls == []
    assert result["processed"] == 0  # ni duración (apagada) ni logros (no activado)


def test_delete_user_data_removes_everything_of_that_user_only(db_session):
    from app.models.forum import ForumPost, ForumReview, ForumThread
    from app.models.game import FavoriteGame

    _library(db_session, ANA, (10, "Hades"))
    _library(db_session, BETO, (10, "Hades"))
    favorites_service.add_favorite(db_session, ANA, 10)
    favorites_service.add_favorite(db_session, BETO, 10)
    library_service.set_state(db_session, ANA, 10, "playing")
    profile_service.update_preferences(db_session, ANA, is_public=True)
    thread = forum_service.create_thread(db_session, 10, "Hades", Author(steam_id=ANA, name="Ana"), "Título", "Texto")
    forum_service.add_post(db_session, thread["id"], Author(steam_id=BETO, name="Beto"), "Respuesta de Beto")
    forum_service.upsert_review(db_session, 10, "Hades", Author(steam_id=ANA, name="Ana"), 9, "Bueno")
    forum_service.upsert_review(db_session, 10, "Hades", Author(steam_id=BETO, name="Beto"), 7, "Bien")

    profile_service.delete_user_data(db_session, ANA)

    assert profile_service.is_public(db_session, ANA) is False
    assert library_service.get_states(db_session, ANA) == {}
    assert db_session.query(FavoriteGame).filter_by(steam_id=ANA).count() == 0
    assert db_session.query(CachedLibraryEntry).filter_by(steam_id=ANA).count() == 0
    assert db_session.query(ForumThread).count() == 0
    assert db_session.query(ForumPost).count() == 0  # las respuestas del hilo borrado también
    # Lo de Beto queda.
    assert db_session.query(FavoriteGame).filter_by(steam_id=BETO).count() == 1
    assert [review.steam_id for review in db_session.query(ForumReview).all()] == [BETO]


def test_delete_user_data_removes_reports_against_deleted_content(db_session):
    from app.models.forum import ForumReport

    thread = forum_service.create_thread(db_session, 10, "Hades", Author(steam_id=ANA, name="Ana"), "Título", "Texto")
    forum_service.report(db_session, "thread", thread["id"], BETO, "spam")
    other = forum_service.create_thread(db_session, 10, "Hades", Author(steam_id=BETO, name="Beto"), "Otro", "Texto")
    forum_service.report(db_session, "thread", other["id"], ANA, "")
    forum_service.report(db_session, "thread", other["id"], "76561198000000003", "")

    profile_service.delete_user_data(db_session, ANA)

    # Ni la denuncia contra el hilo de Ana ni la que hizo Ana; queda la de un tercero.
    assert [(r.target_id, r.reporter_steam_id) for r in db_session.query(ForumReport).all()] == [
        (other["id"], "76561198000000003")
    ]


def test_delete_user_data_refreshes_activity_of_other_threads(db_session):
    from app.models.forum import ForumThread

    thread = forum_service.create_thread(db_session, 10, "Hades", Author(steam_id=BETO, name="Beto"), "Título", "Texto")
    forum_service.add_post(db_session, thread["id"], Author(steam_id=ANA, name="Ana"), "Respuesta de Ana")

    profile_service.delete_user_data(db_session, ANA)

    row = db_session.get(ForumThread, thread["id"])
    assert row.last_activity_at == row.created_at


def test_delete_user_data_revokes_existing_sessions(db_session, monkeypatch):
    import time

    from starlette.requests import Request

    from app.core import security

    old_token = security.create_session_token(ANA, issued_at=int(time.time()) - 60)

    def request_with(token):
        return Request({"type": "http", "headers": [(b"cookie", f"{security.SESSION_COOKIE}={token}".encode())]})

    assert security.current_steam_id(request_with(old_token), db_session) == ANA

    profile_service.delete_user_data(db_session, ANA)

    assert security.current_steam_id(request_with(old_token), db_session) is None
    # Volver a iniciar sesión después del borrado funciona.
    new_token = security.create_session_token(ANA, issued_at=int(time.time()) + 1)
    assert security.current_steam_id(request_with(new_token), db_session) == ANA
    assert profile_service.is_public(db_session, ANA) is False


def test_profile_names_family_games_from_other_libraries(db_session):
    _library(db_session, BETO, (77, "Juego de Beto"))
    favorites_service.add_favorite(db_session, ANA, 77)

    profile = profile_service.build_profile(db_session, ANA, ANA, {"name": "Ana"})

    assert [game["name"] for game in profile["favorites"]] == ["Juego de Beto"]


# ---------- Pila de pendientes y desafíos ----------


def test_backlog_counts_unplayed_games_not_closed(db_session):
    from app.services import challenge_service

    db_session.add_all([
        CachedLibraryEntry(steam_id=ANA, appid=1, name="A", playtime_forever_minutes=0, fetched_at=datetime.now(timezone.utc)),
        CachedLibraryEntry(steam_id=ANA, appid=2, name="B", playtime_forever_minutes=0, fetched_at=datetime.now(timezone.utc)),
        CachedLibraryEntry(steam_id=ANA, appid=3, name="C", playtime_forever_minutes=90, fetched_at=datetime.now(timezone.utc)),
    ])
    db_session.commit()
    library_service.set_state(db_session, ANA, 2, "abandoned")

    assert challenge_service.backlog(db_session, ANA) == {"unplayed": 1, "total": 3}


def test_monthly_challenges_track_this_month_only(db_session):
    from app.models.game import CachedGameDetails, GameState
    from app.services import challenge_service

    now = datetime(2026, 11, 18, tzinfo=timezone.utc)
    db_session.add_all([
        GameState(steam_id=ANA, appid=1, state="finished", updated_at=datetime(2026, 11, 2, tzinfo=timezone.utc)),
        GameState(steam_id=ANA, appid=2, state="finished", updated_at=datetime(2026, 10, 30, tzinfo=timezone.utc)),
        GameState(steam_id=ANA, appid=3, state="playing", updated_at=datetime(2026, 11, 10, tzinfo=timezone.utc)),
        CachedGameDetails(appid=1, hltb_main_hours=4.5, fetched_at=now),
    ])
    db_session.commit()

    items = {item["id"]: item for item in challenge_service.monthly_challenges(db_session, ANA, now)["items"]}

    assert (items["start"]["progress"], items["start"]["goal"]) == (1, 1)
    assert (items["short"]["progress"], items["short"]["goal"]) == (1, 1)
    assert (items["finish"]["progress"], items["finish"]["goal"]) == (1, 3)  # el de octubre no cuenta
