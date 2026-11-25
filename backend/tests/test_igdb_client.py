import httpx
import pytest
import respx

from app.core.config import Settings
from app.services import igdb_client

HOUR = 3600
TOKEN_URL = "https://id.twitch.tv/oauth2/token"
EXTERNAL_URL = "https://api.igdb.com/v4/external_games"
TIMES_URL = "https://api.igdb.com/v4/game_time_to_beats"


@pytest.fixture()
def configured(monkeypatch):
    monkeypatch.setattr(igdb_client, "get_settings", lambda: Settings(igdb_client_id="cliente", igdb_client_secret="secreto"))


def _token(value="token-1"):
    return httpx.Response(200, json={"access_token": value, "expires_in": 5_000_000, "token_type": "bearer"})


def test_credible_hours_uses_the_normal_time():
    entry = {"hastily": 4.6 * HOUR, "normally": 10.4 * HOUR, "completely": 27.1 * HOUR, "count": 36}
    assert igdb_client.credible_hours(entry) == 10.4


def test_credible_hours_falls_back_to_the_quick_time():
    assert igdb_client.credible_hours({"hastily": 2 * HOUR, "count": 3}) == 2.0


@pytest.mark.parametrize(
    ("entry", "hours"),
    [
        # Cada promedio sale de gente distinta: un cruce chico entre ellos no lo invalida.
        ({"hastily": 3.3 * HOUR, "normally": 3.0 * HOUR, "completely": 5.7 * HOUR, "count": 7}, 3.0),  # Unpacking
        ({"hastily": 26 * HOUR, "normally": 50.8 * HOUR, "completely": 48.9 * HOUR, "count": 9}, 50.8),  # Subnautica
    ],
)
def test_credible_hours_tolerates_small_crossings(entry, hours):
    assert igdb_client.credible_hours(entry) == hours


@pytest.mark.parametrize(
    "entry",
    [
        None,
        {},
        {"normally": 10 * HOUR, "count": 2},  # muy pocas personas
        {"hastily": 8715 * HOUR, "normally": 12334 * HOUR, "count": 16},  # juego sin final
        {"hastily": 9 * HOUR, "normally": 33501 * HOUR, "completely": 40 * HOUR, "count": 7},  # fuera de orden
        {"normally": 0.1 * HOUR, "count": 5},  # seis minutos no es terminarlo
        {"completely": 20 * HOUR, "count": 5},  # sin tiempo para la historia
    ],
)
def test_credible_hours_rejects_junk(entry):
    assert igdb_client.credible_hours(entry) is None


@respx.mock
async def test_get_times_maps_steam_appids_to_hours_and_links(configured):
    token = respx.post(TOKEN_URL).mock(return_value=_token())
    external = respx.post(EXTERNAL_URL).mock(
        return_value=httpx.Response(
            200,
            json=[
                {"id": 1, "uid": "620", "game": {"id": 72, "url": "https://www.igdb.com/games/portal-2"}},
                {"id": 2, "uid": "4000", "game": {"id": 1, "url": "https://example.com/otra-cosa"}},
            ],
        )
    )
    times = respx.post(TIMES_URL).mock(
        return_value=httpx.Response(
            200,
            json=[
                {"id": 9, "game_id": 72, "hastily": 16560, "normally": 37440, "completely": 97560, "count": 36},
                {"id": 10, "game_id": 1, "hastily": 33480, "normally": 120603600, "completely": 145800, "count": 7},
            ],
        )
    )

    result = await igdb_client.get_times([620, 4000, 999999])

    assert result == {
        620: {"hours": 10.4, "samples": 36, "url": "https://www.igdb.com/games/portal-2"},
        4000: {"hours": None, "samples": 7, "url": ""},  # dato absurdo y link que no es de IGDB
        999999: {"hours": None, "samples": 0, "url": ""},  # no está en IGDB
    }
    # Solo viajan números de juego, con las claves de la app.
    body = external.calls.last.request.content.decode()
    assert 'uid = ("620","4000","999999")' in body and "external_game_source = 1" in body
    assert "where game_id = (1,72)" in times.calls.last.request.content.decode()
    request = external.calls.last.request
    assert request.headers["Client-ID"] == "cliente" and request.headers["Authorization"] == "Bearer token-1"
    assert b"client_secret=secreto" in token.calls.last.request.content
    assert token.call_count == 1  # el token se reusa entre pedidos


@respx.mock
async def test_an_expired_token_is_renewed_once(configured):
    respx.post(TOKEN_URL).mock(side_effect=[_token("viejo"), _token("nuevo")])
    respx.post(EXTERNAL_URL).mock(side_effect=[httpx.Response(401, json={}), httpx.Response(200, json=[])])

    assert await igdb_client.get_times([620]) == {620: {"hours": None, "samples": 0, "url": ""}}


@respx.mock
async def test_failures_return_none_so_the_game_is_retried(configured):
    respx.post(TOKEN_URL).mock(return_value=_token())
    respx.post(EXTERNAL_URL).mock(return_value=httpx.Response(500, text="error"))

    assert await igdb_client.get_times([620]) is None


@respx.mock
async def test_wrong_keys_pause_igdb(configured):
    from app.services import throttle

    respx.post(TOKEN_URL).mock(return_value=httpx.Response(403, json={"message": "invalid client secret"}))

    assert await igdb_client.get_times([620]) is None
    assert throttle.is_cooling_down("igdb")


@respx.mock
async def test_without_keys_nothing_is_requested(monkeypatch):
    monkeypatch.setattr(igdb_client, "get_settings", lambda: Settings(igdb_client_id="", igdb_client_secret=""))

    assert await igdb_client.get_times([620]) is None
    assert not respx.calls
