"""Script de validación manual (sin FastAPI ni DB): prueba la conexión con la Steam Web API.

Uso (desde la carpeta backend/, con el entorno virtual activado):
    python scripts/check_steam_library.py <SteamID64_o_vanity_url>

Ejemplo:
    python scripts/check_steam_library.py gaben
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import get_settings  # noqa: E402
from app.services.steam_client import (  # noqa: E402
    InvalidSteamIDError,
    PrivateProfileError,
    SteamAPIError,
    SteamClient,
)


async def main(identifier: str) -> None:
    settings = get_settings()
    if not settings.has_steam_api_key:
        print("No hay STEAM_API_KEY configurada en backend/.env. Conseguí una acá:")
        print("  https://steamcommunity.com/dev/apikey")
        return

    async with SteamClient() as client:
        steam_id = await client.resolve_steam_id(identifier)
        print(f"SteamID64 resuelto: {steam_id}")

        games = await client.get_owned_games(steam_id)
        print(f"Juegos encontrados: {len(games)}")
        top_games = sorted(games, key=lambda g: g.get("playtime_forever", 0), reverse=True)[:10]
        for game in top_games:
            hours = game.get("playtime_forever", 0) / 60
            print(f"  - {game['name']} ({hours:.1f} h)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Uso: python scripts/check_steam_library.py <SteamID64_o_vanity_url>")
        sys.exit(1)

    try:
        asyncio.run(main(sys.argv[1]))
    except (InvalidSteamIDError, PrivateProfileError, SteamAPIError) as exc:
        print(f"Error: {exc}")
        sys.exit(1)
