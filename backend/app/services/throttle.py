"""Ritmo de pedidos a los servicios externos, compartido por toda la app.

Cada servicio (Store, reseñas, HowLongToBeat…) tiene un intervalo mínimo entre pedidos.
Si un servicio avisa que nos pasamos (Steam redirige a la portada o responde 429), se lo
"enfría": durante un rato los pedidos a ese servicio fallan al instante en vez de insistir,
que es lo que alarga el bloqueo.

Los clientes HTTP se crean y se cierran en cada uso, así que el estado vive en el módulo.
"""

import asyncio
import logging
import time

logger = logging.getLogger(__name__)

# Segundos mínimos entre dos pedidos al mismo servicio.
MIN_INTERVAL_SECONDS = {
    "store": 0.25,
    "storebrowse": 0.5,
    "reviews": 1.5,
    "hltb": 1.0,
    # IGDB permite 4 pedidos por segundo.
    "igdb": 0.3,
    # Progreso de logros (Steam Web API con la API key) durante la clasificación en segundo plano.
    "achievements": 1.5,
}
DEFAULT_COOLDOWN_SECONDS = 10 * 60


class ServiceCoolingDown(Exception):
    """El servicio está enfriándose después de un rate limit: no se le pide nada por ahora."""


_locks: dict[str, asyncio.Lock] = {}
_last_request: dict[str, float] = {}
_blocked_until: dict[str, float] = {}


async def wait_turn(service: str) -> None:
    """Espera hasta que se pueda pedir a `service`. Lanza ServiceCoolingDown si está enfriándose."""
    if is_cooling_down(service):
        raise ServiceCoolingDown(service)
    interval = MIN_INTERVAL_SECONDS.get(service, 0)
    if interval <= 0:
        return
    lock = _locks.setdefault(service, asyncio.Lock())
    async with lock:
        elapsed = time.monotonic() - _last_request.get(service, 0)
        if elapsed < interval:
            await asyncio.sleep(interval - elapsed)
        _last_request[service] = time.monotonic()


def cool_down(service: str, seconds: float = DEFAULT_COOLDOWN_SECONDS) -> None:
    if not is_cooling_down(service):
        logger.warning("%s nos limitó: se pausan sus pedidos por %d minutos", service, seconds // 60)
    _blocked_until[service] = time.monotonic() + seconds


def is_cooling_down(service: str) -> bool:
    return time.monotonic() < _blocked_until.get(service, 0)


def reset() -> None:
    """Solo para tests."""
    _locks.clear()
    _last_request.clear()
    _blocked_until.clear()
