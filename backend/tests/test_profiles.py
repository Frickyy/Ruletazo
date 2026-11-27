"""Perfiles, privacidad, juegos en común, configuración pública y monetización."""

from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.core.config import Settings
from app.models.game import CachedGameDetails, CachedLibraryEntry
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


def test_profiles_are_public_by_default(db_session):
    assert profile_service.can_view(db_session, ANA, BETO) is True
    assert profile_service.can_view(db_session, ANA, None) is True

    profile_service.update_preferences(db_session, ANA, is_public=False)

    assert profile_service.can_view(db_session, ANA, ANA) is True
    assert profile_service.can_view(db_session, ANA, BETO) is False
    assert profile_service.can_view(db_session, ANA, None) is False


def test_achievement_tracking_is_opt_in(db_session):
    assert profile_service.tracks_achievements(db_session, ANA) is False
    profile_service.update_preferences(db_session, ANA, track_achievements=True)
    assert profile_service.tracks_achievements(db_session, ANA) is True
    # Cambiar una preferencia no toca la otra.
    assert profile_service.is_public(db_session, ANA) is True


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
    assert profile["preferences"] == {"is_public": True, "track_achievements": False, "sync_steam_states": False}


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

    profile_service.update_preferences(db_session, BETO, is_public=False)
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
    monkeypatch.setattr(profiles, "get_settings", lambda: Settings(support_links="Ko-fi|https://ko-fi.com/x"))
    config = profiles.public_config()
    assert config["support_links"] == [{"name": "Ko-fi", "url": "https://ko-fi.com/x"}]
    assert "hltb_enabled" not in config


def test_forum_authors_carry_supporter_badge(db_session, monkeypatch):
    monkeypatch.setattr(forum_service, "get_settings", lambda: Settings(supporter_steam_ids=ANA))
    forum_service.upsert_review(db_session, 1, "Juego", Author(steam_id=ANA, name="Ana"), 8, "Bueno")
    forum_service.upsert_review(db_session, 1, "Juego", Author(steam_id=BETO, name="Beto"), 6, "Normal")

    authors = {review["author"]["name"]: review["author"]["is_supporter"] for review in forum_service.list_reviews(db_session, 1)}

    assert authors == {"Ana": True, "Beto": False}


async def test_enrich_skips_progress_without_opt_in(db_session, monkeypatch):
    from app.services import store_browse

    _library(db_session, ANA, (620, "Portal 2"))
    db_session.query(CachedLibraryEntry).update({"playtime_forever_minutes": 300})
    db_session.commit()

    async def fake_resolve(identifier):
        return ANA

    async def fake_items(appids):
        return {620: store_browse.parse_item({"appid": 620, "success": 1, "type": 0, "name": "Portal 2"})}

    monkeypatch.setattr(library_service, "resolve_steam_id", fake_resolve)
    monkeypatch.setattr(library_service.store_browse, "get_items", fake_items)
    await library_service.classify_library_batch(db_session, ANA, limit=100)

    result = await library_service.enrich_library_batch(db_session, ANA, limit=5)
    status = await library_service.get_classification_status(db_session, ANA)

    assert result["processed"] == 0  # el progreso de logros se pide solo si lo activaste
    assert status["enriched"] == status["total"] == 1


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
    from app.models.game import CompletionSample, GameState
    from app.services import challenge_service

    now = datetime(2026, 11, 18, tzinfo=timezone.utc)
    db_session.add_all([
        GameState(steam_id=ANA, appid=1, state="finished", updated_at=datetime(2026, 11, 2, tzinfo=timezone.utc)),
        GameState(steam_id=ANA, appid=2, state="finished", updated_at=datetime(2026, 10, 30, tzinfo=timezone.utc)),
        GameState(steam_id=ANA, appid=3, state="playing", updated_at=datetime(2026, 11, 10, tzinfo=timezone.utc)),
        # Tres personas lo terminaron en unas 4 horas: cuenta como corto.
        CompletionSample(steam_id="a", appid=1, minutes=230, created_at=now),
        CompletionSample(steam_id="b", appid=1, minutes=250, created_at=now),
        CompletionSample(steam_id="c", appid=1, minutes=900, created_at=now),
    ])
    db_session.commit()

    items = {item["id"]: item for item in challenge_service.monthly_challenges(db_session, ANA, now)["items"]}

    assert (items["start"]["progress"], items["start"]["goal"]) == (1, 1)
    assert (items["short"]["progress"], items["short"]["goal"]) == (1, 1)
    assert (items["finish"]["progress"], items["finish"]["goal"]) == (1, 3)  # el de octubre no cuenta


# ---------- Duración según la comunidad ----------


def _finish(db, steam_id, appid, minutes):
    db.add(CachedLibraryEntry(steam_id=steam_id, appid=appid, name="Juego", playtime_forever_minutes=minutes, fetched_at=datetime.now(timezone.utc)))
    db.commit()
    library_service.set_state(db, steam_id, appid, "finished")


def test_community_duration_needs_three_people_and_uses_the_median(db_session):
    from app.services import duration_service

    _finish(db_session, ANA, 10, 600)
    _finish(db_session, BETO, 10, 720)
    assert duration_service.community_durations(db_session, [10]) == {}  # con 2 todavía no se muestra

    _finish(db_session, "76561198000000003", 10, 6000)  # lo dejó abierto días: la mediana no se mueve
    assert duration_service.community_durations(db_session, [10]) == {10: (12.0, 3)}


def test_unfinishing_or_tiny_playtime_does_not_count(db_session):
    from app.models.game import CompletionSample

    _finish(db_session, ANA, 10, 600)
    _finish(db_session, BETO, 20, 10)  # 10 minutos: no es terminarlo
    library_service.set_state(db_session, ANA, 10, "playing")
    library_service.set_state(db_session, ANA, 30, "finished")  # juego de un familiar: sin horas propias

    assert db_session.query(CompletionSample).count() == 0


def test_without_igdb_data_the_community_fills_in(db_session):
    from app.models.game import CachedGameDetails
    from app.services import duration_service

    db_session.add(CachedGameDetails(appid=10, fetched_at=datetime.now(timezone.utc)))
    for index, minutes in enumerate((540, 600, 660)):
        _finish(db_session, f"7656119800000010{index}", 10, minutes)

    assert duration_service.durations(db_session, [10]) == {10: {"hours": 10.0, "source": "community", "samples": 3}}


def test_deleting_data_removes_completion_samples(db_session):
    from app.models.game import CompletionSample

    _finish(db_session, ANA, 10, 600)
    profile_service.delete_user_data(db_session, ANA)
    assert db_session.query(CompletionSample).count() == 0


def test_igdb_comes_before_the_community(db_session, monkeypatch):
    from app.core.config import Settings
    from app.models.game import CachedGameDetails
    from app.services import duration_service

    db_session.add(
        CachedGameDetails(
            appid=10, igdb_hours=10.4, igdb_samples=36,
            igdb_url="https://www.igdb.com/games/portal-2", fetched_at=datetime.now(timezone.utc),
        )
    )
    # Un juego que IGDB no tiene con un dato creíble: queda la mediana de la comunidad.
    db_session.add(CachedGameDetails(appid=20, igdb_hours=None, igdb_samples=2, fetched_at=datetime.now(timezone.utc)))
    for index, minutes in enumerate((540, 600, 660)):
        _finish(db_session, f"7656119800000010{index}", 10, minutes)
        _finish(db_session, f"7656119800000010{index}", 20, minutes)

    with_igdb = Settings(igdb_client_id="cliente", igdb_client_secret="secreto")
    monkeypatch.setattr(duration_service, "get_settings", lambda: with_igdb)
    found = duration_service.durations(db_session, [10, 20])
    assert found[10] == {"hours": 10.4, "source": "igdb", "samples": 36, "url": "https://www.igdb.com/games/portal-2"}
    assert found[20]["source"] == "community"

    # Sin claves no se muestra lo que haya quedado guardado de IGDB.
    monkeypatch.setattr(duration_service, "get_settings", lambda: Settings(igdb_client_id="", igdb_client_secret=""))
    assert duration_service.durations(db_session, [10])[10]["source"] == "community"


def test_cards_skip_igdb_times_of_games_without_an_end(db_session, monkeypatch):
    from app.core.config import Settings
    from app.models.game import CachedGameDetails
    from app.services import duration_service

    db_session.add(CachedGameDetails(appid=10, igdb_hours=99.5, igdb_samples=30, genres=["Rol", "Multijugador masivo"], fetched_at=datetime.now(timezone.utc)))
    db_session.add(CachedGameDetails(appid=20, igdb_hours=28.6, igdb_samples=10, player_categories=[1, 9, 36, 49], fetched_at=datetime.now(timezone.utc)))
    db_session.add(CachedGameDetails(appid=30, igdb_hours=36.2, igdb_samples=32, player_categories=[2], fetched_at=datetime.now(timezone.utc)))
    db_session.commit()
    monkeypatch.setattr(duration_service, "get_settings", lambda: Settings(igdb_client_id="cliente", igdb_client_secret="secreto"))

    assert set(duration_service.durations(db_session, [10, 20, 30])) == {30}


def test_config_says_when_igdb_is_on(monkeypatch):
    from app.core.config import Settings
    from app.routers import profiles

    monkeypatch.setattr(profiles, "get_settings", lambda: Settings(igdb_client_id="cliente", igdb_client_secret="secreto"))
    assert profiles.public_config()["igdb_enabled"] is True
    monkeypatch.setattr(profiles, "get_settings", lambda: Settings(igdb_client_id="", igdb_client_secret=""))
    assert profiles.public_config()["igdb_enabled"] is False


def test_cards_use_the_quick_time_once_it_is_stored(db_session, monkeypatch):
    from app.models.game import CachedGameDetails
    from app.services import duration_service, game_details_service

    now = datetime.now(timezone.utc)
    current = game_details_service.IGDB_VERSION
    with_pvp = [1, 2, 36]  # un jugador y JcJ en línea: no es "solo competitivo"
    # Horas de online: el tiempo rápido es casi igual al normal (GTA V, Rocket League).
    db_session.add(CachedGameDetails(appid=1, igdb_hours=60.0, igdb_quick_hours=58.0, igdb_samples=40, player_categories=with_pvp, igdb_version=current, fetched_at=now))
    # Campaña de verdad: el rápido es bastante menor (Red Dead Redemption 2).
    db_session.add(CachedGameDetails(appid=2, igdb_hours=60.0, igdb_quick_hours=35.0, igdb_samples=40, player_categories=with_pvp, igdb_version=current, fetched_at=now))
    # Buscado antes de que se guardara el rápido: se muestra hasta que se vuelva a buscar.
    db_session.add(CachedGameDetails(appid=3, igdb_hours=60.0, igdb_samples=40, player_categories=with_pvp, igdb_version=1, fetched_at=now))
    db_session.commit()
    monkeypatch.setattr(duration_service, "get_settings", lambda: Settings(igdb_client_id="cliente", igdb_client_secret="secreto"))

    assert set(duration_service.durations(db_session, [1, 2, 3])) == {2, 3}


# ---------- Sincronizar estados con Steam ----------


def test_syncing_states_with_steam_is_opt_in_and_needs_achievement_progress(db_session):
    assert profile_service.syncs_steam_states(db_session, ANA) is False

    prefs = profile_service.update_preferences(db_session, ANA, sync_steam_states=True)
    assert prefs == {"is_public": True, "track_achievements": True, "sync_steam_states": True}

    # Sin el progreso de logros no se puede saber qué terminaste: apagarlo apaga la sincronización.
    prefs = profile_service.update_preferences(db_session, ANA, track_achievements=False)
    assert prefs["sync_steam_states"] is False


def test_sync_marks_recent_games_as_playing_and_complete_ones_as_finished(db_session):
    from datetime import timedelta

    from app.models.game import UserGameProgress

    now = datetime.now(timezone.utc)
    recent, old = int((now - timedelta(days=3)).timestamp()), int((now - timedelta(days=30)).timestamp())
    for appid, name, last_played in [(10, "Hades", recent), (20, "Celeste", old), (30, "Portal 2", recent), (40, "Abandonado", recent), (50, "Soundpad", recent)]:
        db_session.add(CachedLibraryEntry(steam_id=ANA, appid=appid, name=name, playtime_forever_minutes=60, last_played=last_played, fetched_at=now))
    # Un programa no pasa a "Jugando" aunque se haya usado.
    db_session.add(CachedGameDetails(appid=50, genres=[], featured_reviews=[], is_software=True, fetched_at=now))
    db_session.add(UserGameProgress(steam_id=ANA, appid=20, unlocked=30, total=30, fetched_at=now))
    db_session.add(UserGameProgress(steam_id=ANA, appid=30, unlocked=5, total=50, fetched_at=now))
    db_session.commit()
    library_service.set_state(db_session, ANA, 40, "abandoned")

    # Sin activarlo no toca nada.
    assert library_service.sync_steam_states(db_session, ANA) == {"playing": 0, "finished": 0}

    profile_service.update_preferences(db_session, ANA, sync_steam_states=True)
    assert library_service.sync_steam_states(db_session, ANA, now=now) == {"playing": 2, "finished": 1}
    assert library_service.get_states(db_session, ANA) == {10: "playing", 20: "finished", 30: "playing", 40: "abandoned"}
    # La fecha del estado es la última vez que lo jugó (no cuenta como terminado hoy).
    from app.models.game import GameState

    finished_at = db_session.get(GameState, (ANA, 20)).updated_at
    assert int(finished_at.replace(tzinfo=timezone.utc).timestamp()) == old

    # Si sacás un estado a mano, no vuelve en la próxima sincronización…
    library_service.set_state(db_session, ANA, 10, None)
    assert library_service.sync_steam_states(db_session, ANA, now=now + timedelta(minutes=5)) == {"playing": 0, "finished": 0}
    assert 10 not in library_service.get_states(db_session, ANA)

    # …salvo que lo vuelvas a jugar.
    entry = db_session.get(CachedLibraryEntry, (ANA, 10))
    entry.last_played = int((now + timedelta(minutes=10)).timestamp())
    db_session.commit()
    assert library_service.sync_steam_states(db_session, ANA, now=now + timedelta(minutes=15))["playing"] == 1
