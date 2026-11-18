"""Cliente para HowLongToBeat: no hay mapeo oficial de appid de Steam -> HLTB, así que se busca por nombre."""

import logging
import time
from difflib import SequenceMatcher

import httpx

from app.services import throttle

logger = logging.getLogger(__name__)

# Por debajo de esto, la mejor coincidencia de nombre es probablemente un juego distinto.
MIN_SIMILARITY = 0.4
HLTB_BASE_URL = "https://howlongtobeat.com"
_SECURITY_TTL_SECONDS = 10 * 60
_security_cache: dict = {}
_BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


async def get_completion_times(game_name: str) -> dict:
    """Devuelve horas estimadas para la historia principal y el 100%. `None` si no hay coincidencia confiable."""
    try:
        await throttle.wait_turn("hltb")
        async with httpx.AsyncClient(base_url=HLTB_BASE_URL, timeout=30, follow_redirects=True) as client:
            security = await _security(client)
            response = await _search(client, security, game_name)
            if response.status_code in (401, 403):
                # El token venció antes de lo previsto: se pide uno nuevo y se reintenta una vez.
                security = await _security(client, refresh=True)
                response = await _search(client, security, game_name)
            if response.status_code == 429:
                throttle.cool_down("hltb")
            response.raise_for_status()
            results = response.json().get("data", [])
    except throttle.ServiceCoolingDown:
        return {"main_hours": None, "completionist_hours": None, "failed": True}
    except Exception:
        # Es scraping: un cambio en el sitio o un timeout no debe tumbar el enriquecimiento.
        logger.warning("Fallo buscando '%s' en HowLongToBeat", game_name, exc_info=True)
        return {"main_hours": None, "completionist_hours": None, "failed": True}

    if not results:
        return {"main_hours": None, "completionist_hours": None}

    best = max(results, key=lambda entry: _similarity(game_name, entry.get("game_name", "")))
    if _similarity(game_name, best.get("game_name", "")) < MIN_SIMILARITY:
        return {"main_hours": None, "completionist_hours": None}

    return {
        "main_hours": _hours(best.get("comp_main")),
        "completionist_hours": _hours(best.get("comp_100")),
    }



async def _security(client: httpx.AsyncClient, refresh: bool = False) -> dict:
    """Token y cookies que HLTB exige para buscar. Se reusan unos minutos: antes se cargaba
    la portada y se pedía un token nuevo por cada juego (3 pedidos por búsqueda)."""
    cached = _security_cache.get("value")
    if cached and not refresh and time.monotonic() < _security_cache.get("expires", 0):
        return cached
    await client.get("/", headers=_BROWSER_HEADERS)
    init_response = await client.get(
        "/api/search/site/init",
        headers={**_BROWSER_HEADERS, "Accept": "application/json", "Referer": f"{HLTB_BASE_URL}/"},
    )
    init_response.raise_for_status()
    data = init_response.json()
    value = {
        "headers": {
            "Content-Type": "application/json",
            "x-auth-token": str(data.get("token", "")),
            "x-hp-key": str(data.get("hpKey", "")),
            "x-hp-val": str(data.get("hpVal", "")),
            "User-Agent": _BROWSER_HEADERS["User-Agent"],
            "Origin": HLTB_BASE_URL,
            "Referer": f"{HLTB_BASE_URL}/",
        },
        "cookies": dict(client.cookies),
    }
    _security_cache.update(value=value, expires=time.monotonic() + _SECURITY_TTL_SECONDS)
    return value


async def _search(client: httpx.AsyncClient, security: dict, game_name: str) -> httpx.Response:
    for name, cookie in security["cookies"].items():
        client.cookies.set(name, cookie)
    return await client.post("/api/search/site/", headers=security["headers"], json=_search_payload(game_name))


def _search_payload(game_name: str) -> dict:
    return {
        "searchType": "games",
        "searchTerms": game_name.split(),
        "searchPage": 1,
        "size": 20,
        "searchOptions": {
            "games": {
                "userId": 0,
                "platform": {"mode": "include", "values": []},
                "sortCategory": "popular",
                "rangeCategory": "main",
                "rangeTime": {"min": 0, "max": 0},
                "gameplay": {"perspective": {"mode": "include", "values": []}, "flow": {"mode": "include", "values": []}, "genre": {"mode": "include", "values": []}, "difficulty": ""},
                "year": {"mode": "include", "values": []},
                "modifier": "",
            },
            "users": {"sortCategory": "postcount"},
            "lists": {"sortCategory": "follows"},
            "filter": "",
            "sort": 0,
            "randomizer": 0,
        },
        "useCache": True,
    }


def _similarity(expected: str, actual: str) -> float:
    return SequenceMatcher(None, expected.casefold(), actual.casefold()).ratio()


def _hours(seconds: int | float | None) -> float | None:
    return round(seconds / 3600, 2) if seconds else None
