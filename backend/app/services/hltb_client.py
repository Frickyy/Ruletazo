"""Cliente para HowLongToBeat: no hay mapeo oficial de appid de Steam -> HLTB, así que se busca por nombre."""

import logging
from difflib import SequenceMatcher

import httpx

logger = logging.getLogger(__name__)

# Por debajo de esto, la mejor coincidencia de nombre es probablemente un juego distinto.
MIN_SIMILARITY = 0.4
HLTB_BASE_URL = "https://howlongtobeat.com"


async def get_completion_times(game_name: str) -> dict:
    """Devuelve horas estimadas para la historia principal y el 100%. `None` si no hay coincidencia confiable."""
    try:
        async with httpx.AsyncClient(base_url=HLTB_BASE_URL, timeout=30, follow_redirects=True) as client:
            browser_headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            }
            await client.get("/", headers=browser_headers)
            init_response = await client.get(
                "/api/search/site/init",
                headers={**browser_headers, "Accept": "application/json", "Referer": f"{HLTB_BASE_URL}/"},
            )
            init_response.raise_for_status()
            security = init_response.json()
            headers = {
                "Content-Type": "application/json",
                "x-auth-token": str(security.get("token", "")),
                "x-hp-key": str(security.get("hpKey", "")),
                "x-hp-val": str(security.get("hpVal", "")),
                "User-Agent": browser_headers["User-Agent"],
                "Origin": HLTB_BASE_URL,
                "Referer": f"{HLTB_BASE_URL}/",
            }
            response = await client.post(
                "/api/search/site/",
                headers=headers,
                json={
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
                },
            )
            response.raise_for_status()
            results = response.json().get("data", [])
    except Exception:
        # howlongtobeatpy scrapea HLTB; un cambio en su HTML o un timeout no debe tumbar el enriquecimiento.
        logger.warning("Fallo buscando '%s' en HowLongToBeat", game_name, exc_info=True)
        return {"main_hours": None, "completionist_hours": None}

    if not results:
        return {"main_hours": None, "completionist_hours": None}

    best = max(results, key=lambda entry: _similarity(game_name, entry.get("game_name", "")))
    if _similarity(game_name, best.get("game_name", "")) < MIN_SIMILARITY:
        return {"main_hours": None, "completionist_hours": None}

    return {
        "main_hours": _hours(best.get("comp_main")),
        "completionist_hours": _hours(best.get("comp_100")),
    }


def _similarity(expected: str, actual: str) -> float:
    return SequenceMatcher(None, expected.casefold(), actual.casefold()).ratio()


def _hours(seconds: int | float | None) -> float | None:
    return round(seconds / 3600, 2) if seconds else None
