import httpx
import pytest
import respx

from app.services.steam_client import (
    InvalidSteamIDError,
    PrivateProfileError,
    SteamAPIError,
    SteamClient,
)

STEAM_ID64 = "76561198000000000"


async def test_resolve_steam_id_passthrough_for_steamid64():
    async with SteamClient(api_key="fake-key") as client:
        result = await client.resolve_steam_id(STEAM_ID64)
    assert result == STEAM_ID64


async def test_resolve_steam_id_extracts_id_from_profile_url():
    async with SteamClient(api_key="fake-key") as client:
        result = await client.resolve_steam_id(f"https://steamcommunity.com/profiles/{STEAM_ID64}")
    assert result == STEAM_ID64


@respx.mock
async def test_resolve_steam_id_resolves_vanity_url():
    respx.get("https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/").mock(
        return_value=httpx.Response(200, json={"response": {"success": 1, "steamid": STEAM_ID64}})
    )
    async with SteamClient(api_key="fake-key") as client:
        result = await client.resolve_steam_id("gaben")
    assert result == STEAM_ID64


@respx.mock
async def test_resolve_steam_id_raises_when_vanity_not_found():
    respx.get("https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/").mock(
        return_value=httpx.Response(200, json={"response": {"success": 42}})
    )
    async with SteamClient(api_key="fake-key") as client:
        with pytest.raises(InvalidSteamIDError):
            await client.resolve_steam_id("no-existe-este-usuario")


@respx.mock
async def test_get_owned_games_returns_list():
    respx.get("https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/").mock(
        return_value=httpx.Response(
            200,
            json={
                "response": {
                    "game_count": 1,
                    "games": [{"appid": 10, "name": "Counter-Strike", "playtime_forever": 100}],
                }
            },
        )
    )
    async with SteamClient(api_key="fake-key") as client:
        games = await client.get_owned_games(STEAM_ID64)
    # También los juegos gratis agregados con una licencia gratis.
    request = respx.calls.last.request
    assert request.url.params["include_free_sub"] == "1" and request.url.params["include_played_free_games"] == "1"
    assert games == [{"appid": 10, "name": "Counter-Strike", "playtime_forever": 100}]


@respx.mock
async def test_get_owned_games_raises_on_private_profile():
    respx.get("https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/").mock(
        return_value=httpx.Response(200, json={"response": {}})
    )
    async with SteamClient(api_key="fake-key") as client:
        with pytest.raises(PrivateProfileError):
            await client.get_owned_games(STEAM_ID64)


async def test_request_without_api_key_raises():
    async with SteamClient(api_key="") as client:
        with pytest.raises(SteamAPIError):
            await client.get_owned_games(STEAM_ID64)
