"""Archivos del frontend compilado, con encabezados de caché según el tipo de archivo.

Sin `Cache-Control`, el navegador podía reusar un index.html viejo durante horas: después de
un deploy, quien ya había entrado seguía viendo la versión anterior (con los nombres de los
.js de antes). Ahora:

- HTML (la página y las de buscadores): `no-cache`. El navegador lo guarda, pero pregunta en
  cada visita si cambió (con ETag, así que si no cambió la respuesta es un 304 sin cuerpo).
- /assets/*: Vite les pone un hash en el nombre, así que un archivo nunca cambia de contenido;
  se guardan un año.
- El resto (íconos, imagen para compartir, manifest, sitemap, robots): una hora.
"""

import os
from pathlib import PurePath

from starlette.responses import Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

NO_CACHE = "no-cache"
IMMUTABLE = "public, max-age=31536000, immutable"
SHORT = "public, max-age=3600"


def cache_control_for(request_path: str, file_path: str) -> str:
    if request_path.startswith("/assets/"):
        return IMMUTABLE
    if PurePath(file_path).suffix == ".html":
        return NO_CACHE
    return SHORT


class FrontendStaticFiles(StaticFiles):
    def file_response(
        self, full_path: os.PathLike, stat_result: os.stat_result, scope: Scope, status_code: int = 200
    ) -> Response:
        response = super().file_response(full_path, stat_result, scope, status_code)
        response.headers["Cache-Control"] = cache_control_for(scope.get("path", ""), str(full_path))
        return response
