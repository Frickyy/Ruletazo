"""Cliente de IGDB, la base de juegos de Twitch: cuánto se tarda en terminar un juego.

Busca por el número del juego en Steam (no por nombre, como HowLongToBeat) y de a muchos juegos por
pedido. A IGDB solo le llega ese número, nada de quién tiene el juego. Necesita IGDB_CLIENT_ID e
IGDB_CLIENT_SECRET, de una app registrada en https://dev.twitch.tv/console; sin ellos no se pide nada.

Los tiempos los cargan los usuarios de IGDB, y en los juegos multijugador o sin final hay cualquier
cosa (Garry's Mod: 33.501 h). Por eso solo se usa un dato creíble: ver `credible_hours`.
"""

import logging
import time

import httpx

from app.core.config import get_settings
from app.services import throttle

logger = logging.getLogger(__name__)

TOKEN_URL = "https://id.twitch.tv/oauth2/token"
API_URL = "https://api.igdb.com/v4"
# Steam en la lista de fuentes externas de IGDB (external_game_sources).
STEAM_SOURCE = 1
# Juegos por pedido. IGDB devuelve hasta 500 filas y un appid puede tener más de una (ediciones).
BATCH_SIZE = 200
# Un dato creíble: al menos MIN_SAMPLES personas y entre 15 minutos y 150 horas.
MIN_SAMPLES = 3
MIN_HOURS = 0.25
MAX_HOURS = 150
# Rápido <= normal <= completo, con un margen: cada promedio sale de gente distinta y en los juegos
# cortos se cruzan un poco (Unpacking: 3,3 / 3,0 / 5,7 h). Más que eso es un dato roto.
ORDER_TOLERANCE = 1.25
# El tiempo al 100 % se muestra hasta este tope: más arriba suelen ser juegos sin final.
MAX_FULL_HOURS = 300
_HEADERS = {"User-Agent": "Ruletazo/1.0 (+https://ruletazo.app)", "Accept": "application/json"}
# El token de la app dura unos 60 días: se guarda en memoria y se renueva un día antes de que venza.
_token: dict = {}


class IGDBError(Exception):
    """IGDB respondió algo que no se entiende."""


def enabled() -> bool:
    return get_settings().igdb_configured


def reset() -> None:
    """Solo para tests."""
    _token.clear()


def credible_hours(entry: dict | None) -> float | None:
    """Las horas para terminarlo ("normally": la historia con algunos extras) si el dato es creíble.

    IGDB guarda tres promedios en segundos: rápido (hastily), normal (normally) y completo
    (completely), y cuántas personas cargaron su tiempo (count). Se descarta con menos de
    MIN_SAMPLES personas, fuera de 15 min a 150 h, o si los tres no van en orden (ver
    ORDER_TOLERANCE): en los juegos sin final alguien carga miles de horas y rompe los promedios.
    """
    if not entry or (entry.get("count") or 0) < MIN_SAMPLES:
        return None
    present = [entry[key] for key in ("hastily", "normally", "completely") if entry.get(key)]
    if any(before > after * ORDER_TOLERANCE for before, after in zip(present, present[1:])):
        return None
    seconds = entry.get("normally") or entry.get("hastily")
    if not seconds:
        return None
    hours = seconds / 3600
    if not MIN_HOURS <= hours <= MAX_HOURS:
        return None
    return round(hours, 1)


# Categorías de jugadores de la tienda (ver store_browse): un jugador, y MMO o JcJ (en línea, local, LAN).
SINGLE_PLAYER_CATEGORY = 2
COMPETITIVE_CATEGORIES = {20, 36, 37, 47, 49}
MMO_GENRE = "Multijugador masivo"


def makes_sense(
    hours: float | None,
    *,
    samples: int = 0,
    categories=(),
    genres=(),
    quick_hours: float | None = None,
    check_quick: bool = True,
) -> bool:
    """¿Tiene sentido decir cuánto dura este juego? Además de un dato creíble (credible_hours), se
    descartan los juegos sin final o con el dato roto, que IGDB no distingue:

    - solo multijugador competitivo (Fall Guys, Among Us) o MMO (Destiny 2, Final Fantasy XIV);
    - muy cortos con pocos datos (Forza Horizon 5: "1 h" con 4 personas);
    - con `check_quick` (hace falta el tiempo rápido): horas de online en vez de campaña, cuando el
      tiempo rápido falta o es casi igual al normal en un juego largo con JcJ (GTA V, Rocket League),
      o tiempos muy desparejos (Counter-Strike 2: 1 h rápido y 14 h normal).
    """
    if hours is None:
        return False
    categories = set(categories or [])
    competitive = bool(categories & COMPETITIVE_CATEGORIES)
    if SINGLE_PLAYER_CATEGORY not in categories and competitive:
        return False
    if MMO_GENRE in (genres or []):
        return False
    if hours < 2 and (samples or 0) < 6:
        return False
    if check_quick:
        if competitive and hours >= 50 and (quick_hours is None or quick_hours >= 0.8 * hours):
            return False
        if quick_hours and hours / quick_hours > 6:
            return False
    return True


def extra_hours(entry: dict | None, hours: float | None) -> tuple[float | None, float | None]:
    """Los otros dos tiempos (yendo directo a la historia y al 100 %), solo si el normal es creíble
    y estos van en orden con él. Para las páginas "¿Cuánto dura…?"."""
    if not entry or hours is None:
        return None, None
    quick = (entry.get("hastily") or 0) / 3600
    full = (entry.get("completely") or 0) / 3600
    quick_hours = round(quick, 1) if MIN_HOURS <= quick <= hours * ORDER_TOLERANCE else None
    full_hours = round(full, 1) if full and hours <= full * ORDER_TOLERANCE and full <= MAX_FULL_HOURS else None
    return quick_hours, full_hours


async def get_times(appids: list[int]) -> dict[int, dict] | None:
    """{appid: {"hours", "samples", "url", "quick_hours", "full_hours"}} para cada appid pedido. `hours` es None si IGDB no tiene
    un dato creíble o no conoce el juego. Devuelve None si IGDB no respondió: así el juego no queda
    marcado como buscado y se reintenta la próxima vez."""
    if not appids or not enabled():
        return None
    try:
        async with httpx.AsyncClient(base_url=API_URL, timeout=15, headers=_HEADERS) as client:
            games: dict[int, dict] = {}
            for start in range(0, len(appids), BATCH_SIZE):
                uids = ",".join(f'"{appid}"' for appid in appids[start : start + BATCH_SIZE])
                query = f"fields uid,game.url; where external_game_source = {STEAM_SOURCE} & uid = ({uids}); limit 500;"
                for row in await _query(client, "external_games", query):
                    uid, game = str(row.get("uid", "")), row.get("game")
                    if uid.isdigit() and isinstance(game, dict) and "id" in game:
                        games.setdefault(int(uid), game)
            times: dict[int, dict] = {}
            game_ids = sorted({game["id"] for game in games.values()})
            for start in range(0, len(game_ids), 500):
                ids = ",".join(map(str, game_ids[start : start + 500]))
                query = f"fields game_id,hastily,normally,completely,count; where game_id = ({ids}); limit 500;"
                for row in await _query(client, "game_time_to_beats", query):
                    times[row.get("game_id")] = row
    except throttle.ServiceCoolingDown:
        return None
    except (httpx.HTTPError, IGDBError, ValueError, KeyError):
        logger.warning("Fallo pidiendo duraciones a IGDB", exc_info=True)
        return None

    result = {}
    for appid in appids:
        game = games.get(appid, {})
        entry = times.get(game.get("id")) or {}
        url = str(game.get("url") or "")
        hours = credible_hours(entry)
        quick_hours, full_hours = extra_hours(entry, hours)
        result[appid] = {
            "hours": hours,
            "samples": int(entry.get("count") or 0),
            # Solo fichas de IGDB: es un link que se muestra en la página.
            "url": url if url.startswith("https://www.igdb.com/") and len(url) <= 255 else "",
            "quick_hours": quick_hours,
            "full_hours": full_hours,
        }
    return result


async def _query(client: httpx.AsyncClient, endpoint: str, body: str) -> list[dict]:
    client_id = get_settings().igdb_client_id
    for attempt in range(2):
        await throttle.wait_turn("igdb")
        token = await _access_token(refresh=attempt > 0)
        response = await client.post(
            f"/{endpoint}", content=body, headers={"Client-ID": client_id, "Authorization": f"Bearer {token}"}
        )
        if response.status_code == 401 and attempt == 0:
            continue  # el token venció o lo revocaron: se pide otro y se reintenta una vez
        if response.status_code == 429:
            throttle.cool_down("igdb", 60)
        response.raise_for_status()
        rows = response.json()
        if not isinstance(rows, list):
            raise IGDBError(f"Respuesta inesperada de {endpoint}")
        return rows
    raise IGDBError("IGDB rechazó el token nuevo")


async def _access_token(refresh: bool = False) -> str:
    if not refresh and _token.get("value") and time.monotonic() < _token.get("expires_at", 0):
        return _token["value"]
    settings = get_settings()
    async with httpx.AsyncClient(timeout=15, headers=_HEADERS) as client:
        response = await client.post(
            TOKEN_URL,
            data={
                "client_id": settings.igdb_client_id,
                "client_secret": settings.igdb_client_secret,
                "grant_type": "client_credentials",
            },
        )
    if response.status_code in (400, 401, 403):
        # Claves mal puestas o revocadas: mejor no insistir en cada giro.
        logger.warning("Twitch rechazó IGDB_CLIENT_ID / IGDB_CLIENT_SECRET")
        throttle.cool_down("igdb")
    response.raise_for_status()
    data = response.json()
    _token["value"] = data["access_token"]
    _token["expires_at"] = time.monotonic() + max(int(data.get("expires_in", 0)) - 86400, 60)
    return _token["value"]
