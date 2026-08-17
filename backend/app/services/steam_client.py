import logging
import re

import httpx

from app.core.config import get_settings

STEAM_API_BASE_URL = "https://api.steampowered.com"

logger = logging.getLogger(__name__)

# Un SteamID64 siempre son 17 dígitos (ej. 76561198000000000).
_STEAM_ID64_RE = re.compile(r"^\d{17}$")

# Permite pegar la URL completa del perfil (con /id/<vanity> o /profiles/<steamid64>)
# en vez de tener que extraer el identificador a mano.
_PROFILE_URL_RE = re.compile(r"steamcommunity\.com/(?:id|profiles)/([^/?#]+)", re.IGNORECASE)


class SteamAPIError(Exception):
    """Error genérico al comunicarse con la Steam Web API."""


class InvalidSteamIDError(SteamAPIError):
    """El identificador no es un SteamID64 válido ni una vanity URL resoluble."""


class PrivateProfileError(SteamAPIError):
    """El perfil o el detalle de biblioteca del usuario es privado."""


class SteamClient:
    """Cliente async para los endpoints de la Steam Web API que usa la app.

    Se usa como context manager async para reutilizar una sola conexión HTTP:

        async with SteamClient() as client:
            steam_id = await client.resolve_steam_id("gaben")
            games = await client.get_owned_games(steam_id)
    """

    def __init__(self, api_key: str | None = None, timeout: float = 10.0) -> None:
        settings = get_settings()
        # api_key=None (default) usa la settings; api_key="" fuerza "sin key" (útil para tests/DI).
        self._api_key = api_key if api_key is not None else settings.steam_api_key
        self._client = httpx.AsyncClient(base_url=STEAM_API_BASE_URL, timeout=timeout)

    async def __aenter__(self) -> "SteamClient":
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        await self._client.aclose()

    async def resolve_steam_id(self, identifier: str) -> str:
        """Acepta un SteamID64, una vanity URL (ej. "gaben") o la URL completa del perfil, y devuelve el SteamID64."""
        identifier = identifier.strip()
        url_match = _PROFILE_URL_RE.search(identifier)
        if url_match:
            identifier = url_match.group(1)

        if _STEAM_ID64_RE.match(identifier):
            return identifier

        response = await self._get(
            "/ISteamUser/ResolveVanityURL/v1/",
            params={"key": self._api_key, "vanityurl": identifier},
        )
        data = response.json().get("response", {})
        if data.get("success") != 1:
            raise InvalidSteamIDError(f"No se encontró ningún perfil de Steam para '{identifier}'.")
        return data["steamid"]

    async def get_owned_games(self, steam_id: str) -> list[dict]:
        """Devuelve la lista cruda de juegos que posee el usuario (appid, name, playtime, etc.)."""
        response = await self._get(
            "/IPlayerService/GetOwnedGames/v1/",
            params={
                "key": self._api_key,
                "steamid": steam_id,
                "include_appinfo": 1,
                "include_played_free_games": 1,
                "format": "json",
            },
        )
        data = response.json().get("response", {})
        if not data:
            raise PrivateProfileError("El perfil o la biblioteca de este usuario es privada.")
        return data.get("games", [])

    async def get_achievement_difficulty(self, appid: int) -> dict:
        """% global de desbloqueo promedio de los logros del juego (no requiere API key).

        Steam no tiene un logro de "platino" como PlayStation; esto se usa como aproximación
        a qué tan difícil es completar el juego, basado en cuánta gente desbloqueó cada logro.
        """
        try:
            response = await self._get(
                "/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/",
                params={"gameid": appid, "format": "json"},
                require_key=False,
            )
        except SteamAPIError:
            return {"total": 0, "average_percent": None}

        achievements = response.json().get("achievementpercentages", {}).get("achievements", [])
        if not achievements:
            return {"total": 0, "average_percent": None}

        percentages = [float(a["percent"]) for a in achievements]
        return {"total": len(percentages), "average_percent": sum(percentages) / len(percentages)}

    async def _get(self, path: str, params: dict, require_key: bool = True) -> httpx.Response:
        if require_key and not self._api_key:
            raise SteamAPIError("Falta STEAM_API_KEY: configurala en backend/.env (ver .env.example).")

        try:
            response = await self._client.get(path, params=params)
        except httpx.HTTPError as exc:
            logger.error("Fallo de red llamando a %s: %s", path, exc)
            raise SteamAPIError(f"No se pudo conectar con la Steam Web API: {exc}") from exc

        if response.status_code == 401:
            logger.warning("Steam API respondió 401 (API key inválida) en %s", path)
            raise SteamAPIError("Steam API Key inválida (revisá STEAM_API_KEY en tu backend/.env).")
        if response.status_code >= 400:
            logger.warning("Steam Web API respondió %s en %s", response.status_code, path)
            raise SteamAPIError(f"Steam Web API respondió {response.status_code}.")
        return response
