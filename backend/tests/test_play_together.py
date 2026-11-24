"""Tests de la clasificación por lote, modos de juego, estados, logros, límites, copias y foro."""

import sqlite3
from datetime import datetime, timezone

import httpx
import pytest
import respx
from fastapi import HTTPException
from starlette.requests import Request

from app.core.rate_limit import RateLimit, client_ip
from app.db import backup
from app.models.game import CachedGameDetails, CachedLibraryEntry, UserGameProgress
from app.schemas.game import Game
from app.services import forum_service, game_details_service, library_service, profile_service, store_browse
from app.services.forum_service import Author, ForumError

STEAM_ID64 = "76561198000000000"
ANA = Author(steam_id="76561198000000001", name="Ana")
BETO = Author(steam_id="76561198000000002", name="Beto")

PORTAL_ITEM = {
    "appid": 620,
    "success": 1,
    "type": 0,
    "name": "Portal 2",
    "tags": [{"tagid": 4182, "weight": 604}, {"tagid": 1664, "weight": 586}, {"tagid": 19, "weight": 512}],
    "categories": {"supported_player_categoryids": [2, 1, 9, 38, 39, 24]},
    "basic_info": {"short_description": "Puzles cooperativos.", "developers": [{"name": "Valve"}]},
    "release": {"steam_release_date": 1303171200},
    "assets": {"asset_url_format": "steam/apps/620/${FILENAME}?t=1", "header": "abc/header.jpg"},
    "best_purchase_option": {"final_price_in_cents": "999"},
}


# ---------- IStoreBrowseService ----------


def test_parse_store_item():
    details = store_browse.parse_item(PORTAL_ITEM)

    assert details["store_available"] is True
    assert details["genres"] == ["Puzles", "Acción"]  # "Un jugador" no es un género
    assert details["developer"] == "Valve"
    assert details["price_cents"] == 999
    assert details["release_date"] == "2011-04-19"
    assert details["header_image"] == "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/620/abc/header.jpg?t=1"
    assert store_browse.player_modes(details["player_categories"]) == {
        "single_player": True,
        "coop": True,
        "multiplayer": True,
        "local_multiplayer": True,
    }


def test_parse_store_item_takes_reviews_from_every_language():
    item = {
        **PORTAL_ITEM,
        "reviews": {
            "summary_filtered": {"review_count": 94499, "percent_positive": 90, "review_score": 8, "review_score_label": "Very Positive"},
            "summary_language_specific": {"review_count": 3823, "percent_positive": 96, "review_score_label": "Extremadamente positivas"},
        },
    }

    details = store_browse.parse_item(item)

    assert details["review_score_desc"] == "Muy positivas"  # el total de todos los idiomas, traducido
    assert details["review_total"] == 94499
    assert details["review_positive"] == 85049


def test_parse_store_item_without_reviews():
    details = store_browse.parse_item(PORTAL_ITEM)

    assert (details["review_score_desc"], details["review_total"], details["review_positive"]) == ("", 0, 0)


def test_store_reviews_reach_the_game_card():
    item = {**PORTAL_ITEM, "reviews": {"summary_filtered": {"review_count": 1200, "percent_positive": 75, "review_score_label": "Mayormente positivas"}}}
    details = CachedGameDetails(appid=620, genres=[], player_categories=[], review_score_desc="Extremadamente positivas", review_total=40)

    game_details_service.apply_store_details(details, store_browse.parse_item(item))
    game = Game(appid=620, name="Portal 2", header_image="")
    library_service.apply_cached_details(game, details)

    assert (game.review_score_desc, game.review_total) == ("Mayormente positivas", 1200)


def test_player_modes_single_player_only():
    assert store_browse.player_modes([2]) == {
        "single_player": True,
        "coop": False,
        "multiplayer": False,
        "local_multiplayer": False,
    }


def test_missing_item_is_unavailable():
    assert store_browse.parse_item(None)["store_available"] is False
    assert store_browse.parse_item({"appid": 1, "success": 2})["store_available"] is False


def test_software_is_marked_and_reaches_the_library():
    soundpad = store_browse.parse_item({"appid": 629520, "success": 1, "type": 6, "name": "Soundpad"})
    assert soundpad["is_software"] is True
    assert store_browse.parse_item(PORTAL_ITEM)["is_software"] is False

    details = CachedGameDetails(appid=629520, genres=[], player_categories=[])
    game_details_service.apply_store_details(details, soundpad)
    game = Game(appid=629520, name="Soundpad", header_image="")
    library_service.apply_cached_details(game, details)
    assert game.is_software is True


@respx.mock
async def test_get_items_asks_for_many_games_at_once():
    route = respx.get(store_browse.STORE_BROWSE_URL).mock(
        return_value=httpx.Response(200, json={"response": {"store_items": [PORTAL_ITEM]}})
    )

    result = await store_browse.get_items([620, 999])

    assert route.call_count == 1
    assert '"include_reviews": true' in route.calls[0].request.url.params["input_json"]
    assert result[620]["name"] == "Portal 2"
    assert result[999]["store_available"] is False


@respx.mock
async def test_get_items_reports_failures_without_caching_them():
    respx.get(store_browse.STORE_BROWSE_URL).mock(return_value=httpx.Response(500))

    result = await store_browse.get_items([620])

    assert result[620]["fetch_failed"] is True


# ---------- Clasificación ----------


def _add_entries(db, *entries):
    for appid, name, minutes in entries:
        db.add(
            CachedLibraryEntry(
                steam_id=STEAM_ID64, appid=appid, name=name, playtime_forever_minutes=minutes, fetched_at=datetime.now(timezone.utc)
            )
        )
    db.commit()


async def test_classify_batch_uses_one_store_request(db_session, monkeypatch):
    _add_entries(db_session, (620, "Portal 2", 0), (999, "Borrado", 0))
    calls = []

    async def fake_items(appids):
        calls.append(appids)
        return {620: store_browse.parse_item(PORTAL_ITEM), 999: store_browse.empty_details()}

    async def fake_resolve(identifier):
        return STEAM_ID64

    monkeypatch.setattr(library_service.store_browse, "get_items", fake_items)
    monkeypatch.setattr(library_service, "resolve_steam_id", fake_resolve)

    result = await library_service.classify_library_batch(db_session, STEAM_ID64, limit=100)

    assert calls == [[620, 999]]
    assert result == {"processed": 2, "remaining": 0, "total": 2, "failed": False}
    status = await library_service.get_classification_status(db_session, STEAM_ID64)
    assert status["classified"] == 2


async def test_enrich_batch_fetches_duration_and_progress(db_session, monkeypatch):
    _add_entries(db_session, (620, "Portal 2", 300))
    profile_service.update_preferences(db_session, STEAM_ID64, track_achievements=True)

    async def fake_items(appids):
        return {620: store_browse.parse_item(PORTAL_ITEM)}

    async def fake_resolve(identifier):
        return STEAM_ID64

    async def fake_hltb(name):
        return {"main_hours": 8.5, "completionist_hours": 21.0}

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc_info):
            return False

        async def get_achievement_progress(self, steam_id, appid):
            return {"unlocked": 45, "total": 51}

    monkeypatch.setattr(library_service.store_browse, "get_items", fake_items)
    monkeypatch.setattr(library_service, "resolve_steam_id", fake_resolve)
    monkeypatch.setattr(library_service.hltb_client, "get_completion_times", fake_hltb)
    monkeypatch.setattr(library_service, "SteamClient", FakeClient)
    await library_service.classify_library_batch(db_session, STEAM_ID64, limit=100)

    result = await library_service.enrich_library_batch(db_session, STEAM_ID64, limit=5)

    assert result["remaining"] == 0
    assert db_session.get(UserGameProgress, (STEAM_ID64, 620)).unlocked == 45
    again = await library_service.enrich_library_batch(db_session, STEAM_ID64, limit=5)
    assert again["processed"] == 0


# ---------- Estados ----------


def test_states_and_summary(db_session):
    library_service.set_state(db_session, STEAM_ID64, 1, "finished")
    library_service.set_state(db_session, STEAM_ID64, 2, "playing")
    library_service.set_state(db_session, STEAM_ID64, 3, "abandoned")
    library_service.set_state(db_session, STEAM_ID64, 3, None)

    assert library_service.get_states(db_session, STEAM_ID64) == {1: "finished", 2: "playing"}
    summary = library_service.state_summary(db_session, STEAM_ID64)
    assert summary["counts"] == {"playing": 1, "finished": 1, "abandoned": 0}
    assert summary["finished_this_year"] == 1
    assert summary["started_this_year"] == 1


def test_summary_counts_only_this_year(db_session):
    library_service.set_state(db_session, STEAM_ID64, 1, "finished")
    assert library_service.state_summary(db_session, STEAM_ID64, year=2000)["finished_this_year"] == 0


# ---------- Límite por visitante ----------


def test_rate_limit_per_client():
    limit = RateLimit("test", max_requests=2, window_seconds=60)
    limit.check("1.1.1.1", now=0)
    limit.check("1.1.1.1", now=1)
    limit.check("2.2.2.2", now=1)  # otro visitante tiene su propio cupo
    with pytest.raises(HTTPException) as exc_info:
        limit.check("1.1.1.1", now=2)
    assert exc_info.value.status_code == 429
    limit.check("1.1.1.1", now=100)  # pasó la ventana


def _request(headers: dict, client_host: str = "203.0.113.77") -> Request:
    return Request({
        "type": "http",
        "headers": [(name.encode(), value.encode()) for name, value in headers.items()],
        "client": (client_host, 0),
    })


def test_client_ip_prefers_cloudflare_over_spoofable_forwarded_for():
    # uvicorn (--forwarded-allow-ips=*) deja en request.client la primera IP de X-Forwarded-For,
    # que la escribe el visitante; CF-Connecting-IP la pone Cloudflare.
    spoofed = _request({"cf-connecting-ip": "198.51.100.5", "x-forwarded-for": "203.0.113.77"})
    assert client_ip(spoofed) == "198.51.100.5"


def test_client_ip_falls_back_to_the_connection_without_cloudflare():
    assert client_ip(_request({}, client_host="127.0.0.1")) == "127.0.0.1"


# ---------- Copias de seguridad ----------


def test_backup_copies_and_keeps_the_latest(tmp_path):
    database = tmp_path / "app.db"
    with sqlite3.connect(database) as connection:
        connection.execute("create table t (x integer)")
        connection.execute("insert into t values (42)")
    backups = tmp_path / "backups"
    for index in range(4):
        (backups).mkdir(exist_ok=True)
        (backups / f"steam_roulette-2020010{index}-000000.db").write_bytes(b"")

    copy = backup.backup_now(f"sqlite:///{database}", str(backups), keep=2)

    assert copy is not None
    with sqlite3.connect(copy) as connection:
        assert connection.execute("select x from t").fetchone() == (42,)
    assert len(list(backups.glob("steam_roulette-*.db"))) == 2


def test_backup_ignores_non_sqlite_urls(tmp_path):
    assert backup.backup_now("postgresql://localhost/db", str(tmp_path)) is None
    assert backup.backup_now("sqlite:///:memory:", str(tmp_path)) is None


# ---------- Foro: edición ----------


def test_author_can_edit_thread_and_post(db_session):
    thread = forum_service.create_thread(db_session, 1, "Juego", ANA, "Título", "Texto")
    post = forum_service.add_post(db_session, thread["id"], ANA, "Respuesta")

    edited = forum_service.edit_thread(db_session, thread["id"], ANA.steam_id, "Título nuevo", "Texto nuevo")
    edited_post = forum_service.edit_post(db_session, post["id"], ANA.steam_id, "Respuesta corregida")

    assert edited["title"] == "Título nuevo"
    assert edited["edited_at"] is not None
    assert edited_post["body"] == "Respuesta corregida"
    assert edited_post["edited_at"] is not None


def test_others_cannot_edit(db_session):
    thread = forum_service.create_thread(db_session, 1, "Juego", ANA, "Título", "Texto")
    with pytest.raises(ForumError) as exc_info:
        forum_service.edit_thread(db_session, thread["id"], BETO.steam_id, "Otro", "Otro")
    assert exc_info.value.status_code == 403


async def test_enrich_skips_games_that_just_failed(db_session, monkeypatch):
    _add_entries(db_session, (620, "Portal 2", 300), (621, "Otro", 300))
    profile_service.update_preferences(db_session, STEAM_ID64, track_achievements=True)
    library_service._enrich_failures.clear()

    async def fake_resolve(identifier):
        return STEAM_ID64

    class FailingClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc_info):
            return False

        async def get_achievement_progress(self, steam_id, appid):
            if appid == 620:
                raise library_service.SteamAPIError("Steam Web API respondió 500.")
            return {"unlocked": 1, "total": 2}

    monkeypatch.setattr(library_service, "resolve_steam_id", fake_resolve)
    monkeypatch.setattr(library_service, "SteamClient", FailingClient)

    first = await library_service.enrich_library_batch(db_session, STEAM_ID64, limit=1)
    second = await library_service.enrich_library_batch(db_session, STEAM_ID64, limit=1)

    assert first["failed"] is True
    # El que falló queda para más tarde y la pasada avanza con el siguiente.
    assert db_session.get(UserGameProgress, (STEAM_ID64, 621)) is not None
    assert second["remaining"] == 0
    library_service._enrich_failures.clear()


@respx.mock
async def test_steam_429_pauses_background_achievement_requests():
    from app.services import throttle
    from app.services.steam_client import SteamAPIError, SteamClient

    route = respx.get("https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/").mock(
        return_value=httpx.Response(429)
    )

    async with SteamClient(api_key="clave") as client:
        with pytest.raises(SteamAPIError):
            await client.get_achievement_progress(STEAM_ID64, 620)
        assert throttle.is_cooling_down("achievements")
        # Mientras está en pausa no se vuelve a pedir.
        with pytest.raises(SteamAPIError):
            await client.get_achievement_progress(STEAM_ID64, 620)

    assert route.call_count == 1
