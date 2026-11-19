from datetime import datetime, timedelta, timezone

from app.models.game import CachedGameDetails, CachedLibraryEntry
from app.services import favorites_service, library_service

STEAM_ID64 = "76561198000000000"


class _FakeSteamClient:
    """Reemplaza a SteamClient en los tests: sin red, sin API key."""

    def __init__(self, steam_id, games):
        self.steam_id = steam_id
        self.games = games
        self.get_owned_games_calls = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc_info):
        return False

    async def resolve_steam_id(self, identifier):
        return self.steam_id

    async def get_owned_games(self, steam_id):
        self.get_owned_games_calls += 1
        return self.games


async def test_get_library_fetches_and_caches_when_empty(db_session, monkeypatch):
    fake_client = _FakeSteamClient(STEAM_ID64, [{"appid": 10, "name": "Counter-Strike", "playtime_forever": 120}])
    monkeypatch.setattr(library_service, "SteamClient", lambda: fake_client)

    result = await library_service.get_library(db_session, "gaben")

    assert len(result) == 1
    assert result[0].name == "Counter-Strike"
    assert result[0].playtime_forever_minutes == 120
    assert fake_client.get_owned_games_calls == 1


async def test_get_library_reuses_fresh_cache(db_session, monkeypatch):
    db_session.add(
        CachedLibraryEntry(
            steam_id=STEAM_ID64,
            appid=10,
            name="Counter-Strike",
            playtime_forever_minutes=120,
            fetched_at=datetime.now(timezone.utc),
        )
    )
    db_session.commit()

    fake_client = _FakeSteamClient(STEAM_ID64, games=[])
    monkeypatch.setattr(library_service, "SteamClient", lambda: fake_client)

    result = await library_service.get_library(db_session, STEAM_ID64)

    assert len(result) == 1
    assert fake_client.get_owned_games_calls == 0


async def test_get_library_refetches_when_cache_is_stale(db_session, monkeypatch):
    stale_time = datetime.now(timezone.utc) - timedelta(hours=2)
    db_session.add(
        CachedLibraryEntry(
            steam_id=STEAM_ID64,
            appid=10,
            name="Counter-Strike (nombre viejo)",
            playtime_forever_minutes=50,
            fetched_at=stale_time,
        )
    )
    db_session.commit()

    fake_client = _FakeSteamClient(STEAM_ID64, [{"appid": 10, "name": "Counter-Strike", "playtime_forever": 130}])
    monkeypatch.setattr(library_service, "SteamClient", lambda: fake_client)

    result = await library_service.get_library(db_session, STEAM_ID64)

    assert result[0].playtime_forever_minutes == 130
    assert fake_client.get_owned_games_calls == 1


class _MultiUserFakeSteamClient:
    """Como _FakeSteamClient, pero resuelve distintos identifiers a distintos steam_ids/catálogos
    (necesario para simular la combinación con la biblioteca de un familiar)."""

    def __init__(self, steam_ids_by_identifier: dict, games_by_steam_id: dict):
        self._steam_ids_by_identifier = steam_ids_by_identifier
        self._games_by_steam_id = games_by_steam_id

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc_info):
        return False

    async def resolve_steam_id(self, identifier):
        return self._steam_ids_by_identifier[identifier]

    async def get_owned_games(self, steam_id):
        return self._games_by_steam_id.get(steam_id, [])


async def test_get_filtered_library_combines_with_friend_as_union(db_session, monkeypatch):
    fake_client = _MultiUserFakeSteamClient(
        steam_ids_by_identifier={"me": "1111", "friend": "2222"},
        games_by_steam_id={
            "1111": [{"appid": 10, "name": "Counter-Strike", "playtime_forever": 100}],
            "2222": [
                {"appid": 10, "name": "Counter-Strike", "playtime_forever": 0},
                {"appid": 20, "name": "Team Fortress Classic", "playtime_forever": 50},
            ],
        },
    )
    monkeypatch.setattr(library_service, "SteamClient", lambda: fake_client)

    games = await library_service.get_filtered_library(db_session, "me", "friend", collection="all", genre=None)

    by_appid = {game.appid: game for game in games}
    assert set(by_appid) == {10, 20}
    assert by_appid[10].source == "both"
    assert by_appid[20].source == "friend"


async def test_get_filtered_library_filters_by_favorites(db_session, monkeypatch):
    fake_client = _MultiUserFakeSteamClient(
        steam_ids_by_identifier={"me": "1111"},
        games_by_steam_id={
            "1111": [
                {"appid": 10, "name": "Counter-Strike", "playtime_forever": 100},
                {"appid": 20, "name": "Team Fortress Classic", "playtime_forever": 50},
            ]
        },
    )
    monkeypatch.setattr(library_service, "SteamClient", lambda: fake_client)
    favorites_service.add_favorite(db_session, "1111", 20)

    games = await library_service.get_filtered_library(db_session, "me", None, collection="favorites", genre=None)

    assert [game.appid for game in games] == [20]
    assert games[0].is_favorite is True


async def test_get_filtered_library_filters_by_genre(db_session, monkeypatch):
    fake_client = _MultiUserFakeSteamClient(
        steam_ids_by_identifier={"me": "1111"},
        games_by_steam_id={
            "1111": [
                {"appid": 10, "name": "Counter-Strike", "playtime_forever": 100},
                {"appid": 20, "name": "Team Fortress Classic", "playtime_forever": 50},
            ]
        },
    )
    monkeypatch.setattr(library_service, "SteamClient", lambda: fake_client)
    db_session.add(CachedGameDetails(appid=10, genres=["Acción"], fetched_at=datetime.now(timezone.utc)))
    db_session.commit()

    games = await library_service.get_filtered_library(db_session, "me", None, collection="all", genre="Acción")

    assert [game.appid for game in games] == [10]


class _FamilySteamClient:
    """Cliente falso con varias bibliotecas; un ID desconocido falla como un perfil privado."""

    libraries = {
        STEAM_ID64: [{"appid": 10, "name": "Counter-Strike"}],
        "76561198000000001": [{"appid": 10, "name": "Counter-Strike"}, {"appid": 20, "name": "Team Fortress"}],
    }

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc_info):
        return False

    async def resolve_steam_id(self, identifier):
        if identifier not in self.libraries:
            raise library_service.SteamAPIError("perfil privado")
        return identifier

    async def get_owned_games(self, steam_id):
        return self.libraries[steam_id]


async def test_bad_family_id_does_not_break_own_library(db_session, monkeypatch):
    monkeypatch.setattr(library_service, "SteamClient", _FamilySteamClient)

    games = await library_service.get_filtered_library(
        db_session, STEAM_ID64, "76561198000000001,no-existe", collection="all", genre=None
    )

    assert {game.appid: game.source for game in games} == {10: "both", 20: "friend"}


async def test_get_game_details_finds_family_game(db_session, monkeypatch):
    monkeypatch.setattr(library_service, "SteamClient", _FamilySteamClient)

    async def fake_details(db, appid, name):
        return CachedGameDetails(appid=appid, genres=["Acción"], featured_reviews=[], achievement_total=0)

    monkeypatch.setattr(library_service.game_details_service, "get_or_fetch_details", fake_details)

    game = await library_service.get_game_details(db_session, STEAM_ID64, "76561198000000001", 20)

    assert game.name == "Team Fortress"
    assert game.source == "friend"
    assert game.genres == ["Acción"]


async def test_personal_data_is_only_shown_to_its_owner(db_session, monkeypatch):
    fake_client = _MultiUserFakeSteamClient(
        steam_ids_by_identifier={"me": "1111"},
        games_by_steam_id={"1111": [{"appid": 10, "name": "Counter-Strike", "playtime_forever": 100}]},
    )
    monkeypatch.setattr(library_service, "SteamClient", lambda: fake_client)
    favorites_service.add_favorite(db_session, "1111", 10)
    library_service.set_state(db_session, "1111", 10, "playing")

    owner = await library_service.get_filtered_library(db_session, "me", None, "all", None, viewer_steam_id="1111")
    stranger = await library_service.get_filtered_library(db_session, "me", None, "all", None, viewer_steam_id=None)
    detail = await library_service.get_game_details(db_session, "me", None, 10, viewer_steam_id="2222")

    assert (owner[0].is_favorite, owner[0].state) == (True, "playing")
    assert (stranger[0].is_favorite, stranger[0].state) == (False, None)
    assert (detail.is_favorite, detail.state) == (False, None)
