"""Archivos del frontend compilado: encabezados de caché y las direcciones de cada sección.

Caché. Sin `Cache-Control`, el navegador podía reusar un index.html viejo durante horas: después
de un deploy, quien ya había entrado seguía viendo la versión anterior (con los nombres de los
.js de antes). Ahora:

- HTML (la página y las de buscadores): `no-cache`. El navegador lo guarda, pero pregunta en
  cada visita si cambió (con ETag, así que si no cambió la respuesta es un 304 sin cuerpo).
- /assets/*: Vite les pone un hash en el nombre, así que un archivo nunca cambia de contenido;
  se guardan un año.
- El resto (íconos, imagen para compartir, manifest, sitemap, robots): una hora.

Secciones. El frontend usa direcciones normales (/foro/juego/620, /sala/ABC123). Como no son
archivos, se devuelve index.html y el frontend arma la sección (ver `app_page` y `page_html`).
"""

import os
import re
from pathlib import Path, PurePath
from urllib.parse import quote

import anyio
from starlette.exceptions import HTTPException
from starlette.responses import HTMLResponse, Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

NO_CACHE = "no-cache"
IMMUTABLE = "public, max-age=31536000, immutable"
SHORT = "public, max-age=3600"

# Primera parte de la dirección de cada sección (VIEW_SLUGS en frontend/src/routes.js).
APP_SECTIONS = frozenset({"ruleta", "biblioteca", "familia", "foro", "perfil", "privacidad", "terminos", "sala"})
# Lo de cada persona (su biblioteca, su familia, su perfil) y las salas, que duran un rato, no
# van a Google. Con hash nunca se indexaron: así los perfiles siguen fuera de los buscadores.
NOINDEX_SECTIONS = frozenset({"biblioteca", "familia", "perfil", "sala"})
NOINDEX_TAG = '<meta name="robots" content="noindex" />'
_OG_URL = re.compile(r'(<meta property="og:url" content=")([^"]*)(")')


def cache_control_for(request_path: str, file_path: str) -> str:
    if request_path.startswith("/assets/"):
        return IMMUTABLE
    if PurePath(file_path).suffix == ".html":
        return NO_CACHE
    return SHORT


def app_page(request_path: str) -> tuple[int, bool] | None:
    """Cómo responder una dirección que no es un archivo: (estado, si va a Google) para devolver la
    página, o None para dejar el 404 de siempre (la API, o un archivo que no está, como un .js de
    un deploy anterior: devolverle HTML a un <script> rompe peor).

    Una dirección que no existe (/cualquiera) también devuelve la página, así quien se equivoca ve
    la ruleta y no un error, pero con estado 404 para que los buscadores no la guarden.
    """
    section = request_path.strip("/").split("/", 1)[0]
    if section in APP_SECTIONS:
        # Antes que mirar la extensión: un perfil puede tener punto (/perfil/john.doe).
        return 200, section not in NOINDEX_SECTIONS
    if section == "api" or PurePath(request_path).suffix:
        return None
    return 404, False


def page_html(index_html: str, request_path: str, indexable: bool) -> str:
    """index.html para una sección: con su propia dirección en og:url (si quedaba la de la portada,
    Facebook y Messenger llevaban cualquier link compartido, una sala por ejemplo, a la portada) y,
    si es algo personal, con noindex. La dirección va codificada: no puede meter HTML."""
    path = quote(request_path.rstrip("/") or "/")
    html = _OG_URL.sub(lambda match: f"{match[1]}{match[2].rstrip('/')}{path}{match[3]}", index_html, count=1)
    if not indexable:
        html = html.replace("</head>", f"  {NOINDEX_TAG}\n  </head>", 1)
    return html


class FrontendStaticFiles(StaticFiles):
    def file_response(
        self, full_path: os.PathLike, stat_result: os.stat_result, scope: Scope, status_code: int = 200
    ) -> Response:
        response = super().file_response(full_path, stat_result, scope, status_code)
        response.headers["Cache-Control"] = cache_control_for(scope.get("path", ""), str(full_path))
        return response

    async def get_response(self, path: str, scope: Scope) -> Response:
        try:
            return await super().get_response(path, scope)
        except HTTPException as error:
            page = app_page(scope.get("path", "")) if error.status_code == 404 else None
            if page is None:
                raise
        status_code, indexable = page
        index_html = await anyio.to_thread.run_sync(Path(self.directory, "index.html").read_text, "utf-8")
        return HTMLResponse(
            page_html(index_html, scope.get("path", "/"), indexable),
            status_code=status_code,
            headers={"Cache-Control": NO_CACHE},
        )
