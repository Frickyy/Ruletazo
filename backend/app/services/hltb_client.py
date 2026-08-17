"""Cliente para HowLongToBeat: no hay mapeo oficial de appid de Steam -> HLTB, así que se busca por nombre."""

import logging

from howlongtobeatpy import HowLongToBeat

logger = logging.getLogger(__name__)

# Por debajo de esto, la mejor coincidencia de nombre es probablemente un juego distinto.
MIN_SIMILARITY = 0.4


async def get_completion_times(game_name: str) -> dict:
    """Devuelve horas estimadas para la historia principal y el 100%. `None` si no hay coincidencia confiable."""
    try:
        results = await HowLongToBeat().async_search(game_name)
    except Exception:
        # howlongtobeatpy scrapea HLTB; un cambio en su HTML o un timeout no debe tumbar el enriquecimiento.
        logger.warning("Fallo buscando '%s' en HowLongToBeat", game_name, exc_info=True)
        return {"main_hours": None, "completionist_hours": None}

    if not results:
        return {"main_hours": None, "completionist_hours": None}

    best = max(results, key=lambda entry: entry.similarity)
    if best.similarity < MIN_SIMILARITY:
        return {"main_hours": None, "completionist_hours": None}

    return {
        "main_hours": best.main_story or None,
        "completionist_hours": best.completionist or None,
    }
