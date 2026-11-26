"""IndexNow: avisa a Bing, y a los buscadores que usan su índice (DuckDuckGo, Yahoo, la búsqueda
de ChatGPT) y a Yandex, qué direcciones se crearon o se sacaron, para que no esperen a pasar por el
sitemap. Ver https://www.indexnow.org.

La clave no es secreta: está publicada en frontend/public/<KEY>.txt y solo prueba que el sitio es
nuestro. Con ella, a lo sumo alguien podría pedir que revisen nuestras propias direcciones.
"""

import logging

import httpx

logger = logging.getLogger(__name__)

KEY = "fd3787dcf7038d2a375be4f3a50def37"
HOST = "ruletazo.app"
ENDPOINT = "https://api.indexnow.org/indexnow"
# El protocolo acepta hasta 10.000 direcciones por aviso.
MAX_URLS = 10_000
_HEADERS = {"User-Agent": "Ruletazo/1.0 (+https://ruletazo.app)"}


async def submit(urls: list[str]) -> bool:
    """Avisa estas direcciones (de ruletazo.app). True si IndexNow las recibió; nunca tira error."""
    urls = list(dict.fromkeys(url for url in urls if url.startswith(f"https://{HOST}/")))[:MAX_URLS]
    if not urls:
        return True
    payload = {"host": HOST, "key": KEY, "keyLocation": f"https://{HOST}/{KEY}.txt", "urlList": urls}
    try:
        async with httpx.AsyncClient(timeout=20, headers=_HEADERS) as client:
            response = await client.post(ENDPOINT, json=payload)
    except httpx.HTTPError:
        logger.warning("No se pudo avisar a IndexNow", exc_info=True)
        return False
    # 200: recibido. 202: recibido, todavía verificando la clave. El resto: clave o direcciones rechazadas.
    if response.status_code in (200, 202):
        logger.info("IndexNow: %s direcciones avisadas (%s)", len(urls), response.status_code)
        return True
    logger.warning("IndexNow rechazó el aviso: %s %s", response.status_code, response.text[:200])
    return False
