"""Tests de lo agregado para la ruleta, la tienda, el foro y la puesta en producción."""

import sqlite3

import httpx
import pytest
import respx

from app.core.config import Settings
from app.models.game import CachedLibraryEntry
from app.services import forum_service, hidden_service, library_service, throttle
from app.services.forum_service import Author, ForumError
from app.services.store_client import SteamStoreClient, is_adult_content, looks_adult_by_name, normalize_release_date

ANA = Author(steam_id="76561198000000001", name="Ana")
BETO = Author(steam_id="76561198000000002", name="Beto")
STEAM_ID64 = "76561198000000000"


# ---------- Tienda ----------


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("9 DIC 2020", "2020-12-09"),
        ("17 sep. 2020", "2020-09-17"),
        ("1 ENE, 2019", "2019-01-01"),
        ("Dec 9, 2020", "2020-12-09"),
        ("2021", "2021-01-01"),
        ("Próximamente", ""),
        ("31 FEB 2020", ""),
    ],
)
def test_release_date_accepts_spanish_and_english(value, expected):
    assert normalize_release_date(value) == expected


def test_adult_content_uses_store_descriptors():
    assert is_adult_content({"content_descriptors": {"ids": [1, 3]}})
    assert is_adult_content({"content_descriptors": {"ids": [4]}})
    # 1 (algo de desnudez), 2 (violencia) y 5 (maduro) no alcanzan: Cyberpunk tiene 1, 2 y 5.
    assert not is_adult_content({"content_descriptors": {"ids": [1, 2, 5]}})
    assert not is_adult_content({})


def test_adult_name_heuristic():
    assert looks_adult_by_name("Hentai Pussy 2")
    assert not looks_adult_by_name("Stardew Valley")
    assert not looks_adult_by_name("Essex Adventures")  # "sex" dentro de otra palabra


@respx.mock
async def test_store_redirect_cools_the_service_down():
    route = respx.get("https://store.steampowered.com/appreviews/10").mock(
        return_value=httpx.Response(302, headers={"Location": "https://store.steampowered.com/"})
    )

    async with SteamStoreClient() as client:
        assert await client.get_review_digest(10) == {"failed": True}
        calls_after_block = route.call_count
        assert throttle.is_cooling_down("reviews")
        # Mientras se enfría no se vuelve a pedir: falla al instante.
        assert await client.get_review_digest(10) == {"failed": True}

    assert route.call_count == calls_after_block


# ---------- Biblioteca ----------


async def test_library_keeps_last_played_and_hidden_flag(db_session, monkeypatch):
    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc_info):
            return False

        async def resolve_steam_id(self, identifier):
            return STEAM_ID64

        async def get_owned_games(self, steam_id):
            return [
                {"appid": 10, "name": "Counter-Strike", "playtime_forever": 60, "rtime_last_played": 1_600_000_000},
                {"appid": 20, "name": "Nunca jugado", "playtime_forever": 0, "rtime_last_played": 0},
            ]

    monkeypatch.setattr(library_service, "SteamClient", FakeClient)
    hidden_service.hide_game(db_session, STEAM_ID64, 20)

    games = {game.appid: game for game in await library_service.get_filtered_library(db_session, STEAM_ID64, None, "all", None)}

    assert games[10].last_played == 1_600_000_000
    assert games[20].last_played is None
    assert games[20].is_hidden is True
    assert games[10].is_hidden is False
    assert db_session.get(CachedLibraryEntry, (STEAM_ID64, 10)).last_played == 1_600_000_000


def test_hide_and_unhide_are_idempotent(db_session):
    hidden_service.hide_game(db_session, ANA.steam_id, 5)
    hidden_service.hide_game(db_session, ANA.steam_id, 5)
    assert hidden_service.get_hidden_appids(db_session, ANA.steam_id) == {5}
    hidden_service.unhide_game(db_session, ANA.steam_id, 5)
    hidden_service.unhide_game(db_session, ANA.steam_id, 5)
    assert hidden_service.get_hidden_appids(db_session, ANA.steam_id) == set()


# ---------- Moderación del foro ----------


def test_moderator_can_delete_someone_elses_messages(db_session):
    review = forum_service.upsert_review(db_session, 1, "Juego", ANA, 8, "Bueno")
    thread = forum_service.create_thread(db_session, 1, "Juego", ANA, "Pregunta", "¿Qué tal?")
    post = forum_service.add_post(db_session, thread["id"], ANA, "Respuesta")

    with pytest.raises(ForumError) as exc_info:
        forum_service.delete_review_by_id(db_session, review["id"], BETO.steam_id)
    assert exc_info.value.status_code == 403

    forum_service.delete_post(db_session, post["id"], BETO.steam_id, moderator=True)
    forum_service.delete_review_by_id(db_session, review["id"], BETO.steam_id, moderator=True)
    forum_service.delete_thread(db_session, thread["id"], BETO.steam_id, moderator=True)

    assert forum_service.list_reviews(db_session, 1) == []
    assert forum_service.list_threads(db_session, 1) == []


def test_reports_are_grouped_and_cleared_with_the_message(db_session):
    thread = forum_service.create_thread(db_session, 1, "Juego", ANA, "Título", "Texto ofensivo")
    forum_service.report(db_session, "thread", thread["id"], BETO.steam_id, "Insulta")
    forum_service.report(db_session, "thread", thread["id"], BETO.steam_id, "Insulta otra vez")  # no duplica
    forum_service.report(db_session, "thread", thread["id"], "76561198000000003", "")

    reports = forum_service.list_reports(db_session)
    assert len(reports) == 1
    assert reports[0]["report_count"] == 2
    assert reports[0]["reasons"] == ["Insulta"]
    assert reports[0]["author"]["name"] == "Ana"
    assert reports[0]["excerpt"].startswith("Título — Texto ofensivo")

    forum_service.delete_thread(db_session, thread["id"], BETO.steam_id, moderator=True)
    assert forum_service.list_reports(db_session) == []


def test_cannot_report_own_message_or_missing_one(db_session):
    thread = forum_service.create_thread(db_session, 1, "Juego", ANA, "Título", "Texto")
    with pytest.raises(ForumError):
        forum_service.report(db_session, "thread", thread["id"], ANA.steam_id, "")
    with pytest.raises(ForumError) as exc_info:
        forum_service.report(db_session, "post", 999, BETO.steam_id, "")
    assert exc_info.value.status_code == 404


def test_dismissing_reports_keeps_the_message(db_session):
    thread = forum_service.create_thread(db_session, 1, "Juego", ANA, "Título", "Texto")
    forum_service.report(db_session, "thread", thread["id"], BETO.steam_id, "")
    forum_service.dismiss_reports(db_session, "thread", thread["id"])
    assert forum_service.list_reports(db_session) == []
    assert len(forum_service.list_threads(db_session, 1)) == 1


# ---------- Configuración y migraciones ----------


def test_production_requires_session_secret():
    with pytest.raises(RuntimeError):
        Settings(environment="production", session_secret="").check_production_ready()
    Settings(environment="production", session_secret="x" * 32).check_production_ready()
    Settings(environment="development", session_secret="").check_production_ready()


def test_admin_ids_are_parsed():
    assert Settings(admin_steam_ids=" 1, 2 ,,").admin_steam_id_set == {"1", "2"}


def test_migrations_create_a_fresh_database(tmp_path):
    from sqlalchemy import create_engine

    from app.db.migrations import run_migrations

    db_file = tmp_path / "fresh.db"
    engine = create_engine(f"sqlite:///{db_file}")
    run_migrations(engine)
    run_migrations(engine)  # volver a correrlas no hace nada
    engine.dispose()

    connection = sqlite3.connect(db_file)
    tables = {row[0] for row in connection.execute("select name from sqlite_master where type='table'")}
    assert {"hidden_games", "forum_reports", "cached_game_details"} <= tables
    assert connection.execute("select version_num from alembic_version").fetchone() == ("0008",)
    connection.close()


def test_migrations_upgrade_a_database_created_before_alembic(tmp_path):
    from sqlalchemy import create_engine

    from app.db.migrations import run_migrations

    db_file = tmp_path / "legacy.db"
    connection = sqlite3.connect(db_file)
    # Esquema mínimo de la versión anterior (create_all + columnas agregadas a mano, sin alembic_version).
    connection.executescript(
        """
        CREATE TABLE cached_library_entries (steam_id VARCHAR(32), appid INTEGER, name VARCHAR(255),
            playtime_forever_minutes INTEGER, fetched_at DATETIME, PRIMARY KEY (steam_id, appid));
        CREATE TABLE cached_game_details (appid INTEGER PRIMARY KEY, genres JSON, short_description TEXT);
        CREATE TABLE forum_threads (id INTEGER PRIMARY KEY, appid INTEGER, title VARCHAR(120), body TEXT);
        CREATE TABLE forum_posts (id INTEGER PRIMARY KEY, thread_id INTEGER, body TEXT);
        INSERT INTO cached_library_entries VALUES ('1', 10, 'Juego', 5, '2026-01-01');
        """
    )
    connection.close()

    engine = create_engine(f"sqlite:///{db_file}")
    run_migrations(engine)
    engine.dispose()

    connection = sqlite3.connect(db_file)
    library_columns = {row[1] for row in connection.execute("pragma table_info(cached_library_entries)")}
    detail_columns = {row[1] for row in connection.execute("pragma table_info(cached_game_details)")}
    assert "last_played" in library_columns
    assert {"is_adult", "hltb_version", "review_pros"} <= detail_columns
    assert connection.execute("select name from cached_library_entries").fetchone() == ("Juego",)
    connection.close()


@respx.mock
async def test_app_details_reads_spanish_data_cover_and_adult_flag():
    respx.get("https://store.steampowered.com/api/appdetails").mock(
        return_value=httpx.Response(
            200,
            json={
                "4704690": {
                    "success": True,
                    "data": {
                        "type": "game",
                        "name": "MECCHA CHAMELEON",
                        "short_description": "Una aventura.",
                        "release_date": {"date": "9 DIC 2025"},
                        "header_image": "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/4704690/abc/header.jpg",
                        "content_descriptors": {"ids": [4]},
                        "genres": [{"description": "Aventura"}],
                    },
                }
            },
        )
    )

    async with SteamStoreClient() as client:
        details = await client.get_app_details(4704690)

    assert details["release_date"] == "2025-12-09"
    assert details["header_image"].endswith("/abc/header.jpg")
    assert details["is_adult"] is True
    assert details["genres"] == ["Aventura"]
