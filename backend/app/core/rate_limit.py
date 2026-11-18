"""Límite de pedidos por visitante para los endpoints que consultan a Steam con nuestra API key.

Sin esto, si la app se publica, cualquiera podría usarla para pedir bibliotecas y perfiles
ajenos sin parar, gastando la cuota de la API key. El límite es por IP (detrás de un proxy,
uvicorn --proxy-headers pone la IP real) y en memoria: alcanza para un solo proceso.
"""

import time
from collections import deque

from fastapi import HTTPException, Request

_MAX_TRACKED_CLIENTS = 10_000


class RateLimit:
    def __init__(self, name: str, max_requests: int, window_seconds: int) -> None:
        self.name = name
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = {}

    def check(self, client: str, now: float | None = None) -> None:
        current = time.monotonic() if now is None else now
        hits = self._hits.setdefault(client, deque())
        while hits and current - hits[0] > self.window_seconds:
            hits.popleft()
        if len(hits) >= self.max_requests:
            raise HTTPException(status_code=429, detail="Demasiados pedidos seguidos. Esperá unos minutos.")
        hits.append(current)
        if len(self._hits) > _MAX_TRACKED_CLIENTS:
            # Se descartan los clientes más viejos para no crecer sin límite.
            for key in list(self._hits)[: len(self._hits) - _MAX_TRACKED_CLIENTS]:
                self._hits.pop(key, None)

    def reset(self) -> None:
        self._hits.clear()

    async def __call__(self, request: Request) -> None:
        """Dependencia de FastAPI."""
        self.check(request.client.host if request.client else "desconocido")


# Lecturas que disparan pedidos a Steam (biblioteca, ficha, perfiles, búsquedas).
steam_reads = RateLimit("steam_reads", max_requests=240, window_seconds=10 * 60)
# Clasificación en segundo plano: muchas llamadas chicas seguidas.
background = RateLimit("background", max_requests=600, window_seconds=10 * 60)
