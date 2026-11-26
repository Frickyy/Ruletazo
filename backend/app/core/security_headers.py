"""Encabezados de seguridad en todas las respuestas: la página, la API y las páginas que arma el
backend (/cuanto-dura/...).

- Content-Security-Policy: solo corre JavaScript de este mismo dominio, y otra página no puede
  meter Ruletazo en un iframe para engañar clics (frame-ancestors). Las portadas vienen de varios
  dominios de Steam, por eso las imágenes se aceptan de cualquier sitio con HTTPS.
- X-Content-Type-Options: el navegador no adivina el tipo de un archivo.
- Referrer-Policy: a otros sitios les llega solo el dominio, no la dirección completa (que puede
  tener un perfil o el código de una sala).
- Permissions-Policy: la página no usa cámara, micrófono ni ubicación.
- Strict-Transport-Security (solo en producción): el navegador entra siempre por HTTPS.

El modo streamer (/obs) se puede meter en un iframe: hay programas de streaming que lo usan así.
"""

from starlette.types import ASGIApp, Message, Receive, Scope, Send

CONTENT_SECURITY_POLICY = "; ".join(
    [
        "default-src 'self'",
        "script-src 'self'",
        # Estilos en línea: los usan las páginas que arma el backend. Fuentes: Google Fonts.
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        # data: y blob: para las imágenes para compartir que se dibujan en la página.
        "img-src 'self' data: blob: https:",
        "connect-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
    ]
)
HSTS = "max-age=31536000; includeSubDomains"
# La documentación de la API usa scripts de otro dominio. Solo existe en desarrollo (ver main.py).
_DOCS_PATHS = ("/docs", "/redoc")


def _frameable(path: str) -> bool:
    return path == "/obs" or path.startswith("/obs/")


def headers_for(path: str, production: bool) -> list[tuple[bytes, bytes]]:
    headers = [
        (b"x-content-type-options", b"nosniff"),
        (b"referrer-policy", b"strict-origin-when-cross-origin"),
        (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
    ]
    if production or not path.startswith(_DOCS_PATHS):
        policy = CONTENT_SECURITY_POLICY if _frameable(path) else f"{CONTENT_SECURITY_POLICY}; frame-ancestors 'self'"
        headers.append((b"content-security-policy", policy.encode()))
    if not _frameable(path):
        headers.append((b"x-frame-options", b"SAMEORIGIN"))
    if production:
        headers.append((b"strict-transport-security", HSTS.encode()))
    return headers


class SecurityHeadersMiddleware:
    """Middleware ASGI puro (no BaseHTTPMiddleware): no toca el cuerpo de las respuestas."""

    def __init__(self, app: ASGIApp, production: bool = False) -> None:
        self.app = app
        self.production = production

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        extra = headers_for(scope.get("path", ""), self.production)

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                present = {name.lower() for name, _ in headers}
                message["headers"] = headers + [header for header in extra if header[0] not in present]
            await send(message)

        await self.app(scope, receive, send_with_headers)
