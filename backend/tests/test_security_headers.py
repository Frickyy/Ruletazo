from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.testclient import TestClient

from app.core.security_headers import SecurityHeadersMiddleware, headers_for


def _client(production: bool = False) -> TestClient:
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware, production=production)

    @app.get("/api/algo")
    def algo() -> dict:
        return {"ok": True}

    @app.get("/obs")
    def overlay() -> HTMLResponse:
        return HTMLResponse("<p>ruleta</p>")

    @app.get("/propio")
    def own_header() -> HTMLResponse:
        return HTMLResponse("<p>hola</p>", headers={"X-Frame-Options": "DENY"})

    return TestClient(app)


def test_every_response_gets_the_security_headers():
    response = _client().get("/api/algo")

    assert response.json() == {"ok": True}
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert response.headers["x-frame-options"] == "SAMEORIGIN"
    assert "camera=()" in response.headers["permissions-policy"]
    policy = response.headers["content-security-policy"]
    assert "script-src 'self';" in policy and "object-src 'none'" in policy
    assert policy.endswith("frame-ancestors 'self'")
    # HTTPS obligatorio solo en producción (en desarrollo la página va por http://localhost).
    assert "strict-transport-security" not in response.headers


def test_production_forces_https():
    response = _client(production=True).get("/api/algo")

    assert response.headers["strict-transport-security"] == "max-age=31536000; includeSubDomains"


def test_the_streamer_overlay_can_go_inside_an_iframe():
    response = _client().get("/obs?perfil=gaben")

    assert "x-frame-options" not in response.headers
    assert "frame-ancestors" not in response.headers["content-security-policy"]
    assert "script-src 'self'" in response.headers["content-security-policy"]


def test_a_header_set_by_the_route_is_not_duplicated():
    response = _client().get("/propio")

    assert response.headers.get_list("x-frame-options") == ["DENY"]


def test_api_docs_in_development_keep_working_without_the_policy():
    names = {name for name, _ in headers_for("/docs", production=False)}

    assert b"content-security-policy" not in names
    assert b"x-content-type-options" in names
    # En producción la documentación está apagada: esa dirección no tiene por qué saltearse la política.
    assert b"content-security-policy" in {name for name, _ in headers_for("/docs", production=True)}
