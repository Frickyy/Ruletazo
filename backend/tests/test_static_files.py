"""El frontend compilado: encabezados de caché y la página en las direcciones de cada sección."""

import re
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.static_files import APP_SECTIONS, IMMUTABLE, NO_CACHE, NOINDEX_TAG, SHORT, FrontendStaticFiles, page_html

REPO = Path(__file__).resolve().parents[2]
INDEX_HTML = (
    '<!doctype html><html lang="es"><head><title>Ruletazo</title>'
    '<meta property="og:url" content="https://ruletazo.app/" />\n  </head>'
    '<body><div id="root"></div></body></html>'
)


def _client(tmp_path) -> TestClient:
    (tmp_path / "index.html").write_text(INDEX_HTML, encoding="utf-8")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "index-abc123.js").write_text("console.log(1)", encoding="utf-8")
    (tmp_path / "que-jugar-hoy").mkdir()
    (tmp_path / "que-jugar-hoy" / "index.html").write_text("<h1>¿Qué jugar hoy?</h1>", encoding="utf-8")
    (tmp_path / "og-image.png").write_bytes(b"\x89PNG")
    app = FastAPI()

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.mount("/", FrontendStaticFiles(directory=tmp_path, html=True), name="frontend")
    return TestClient(app)


def test_html_pages_are_revalidated_on_every_visit(tmp_path):
    client = _client(tmp_path)

    assert client.get("/").headers["cache-control"] == NO_CACHE
    assert client.get("/que-jugar-hoy/").headers["cache-control"] == NO_CACHE


def test_hashed_assets_are_cached_for_a_year(tmp_path):
    assert _client(tmp_path).get("/assets/index-abc123.js").headers["cache-control"] == IMMUTABLE


def test_other_files_are_cached_for_an_hour(tmp_path):
    assert _client(tmp_path).get("/og-image.png").headers["cache-control"] == SHORT


def test_unchanged_html_answers_304_and_keeps_no_cache(tmp_path):
    client = _client(tmp_path)
    etag = client.get("/").headers["etag"]

    response = client.get("/", headers={"If-None-Match": etag})

    assert response.status_code == 304
    assert response.headers["cache-control"] == NO_CACHE


def test_each_section_address_returns_the_page(tmp_path):
    """Recargar o abrir un link compartido (/sala/ABC123) daba 404: no es un archivo."""
    client = _client(tmp_path)

    for path in ["/foro", "/foro/", "/foro/juego/620/hilo/7", "/privacidad", "/sala/ABC123", "/perfil/john.doe"]:
        response = client.get(path)
        assert response.status_code == 200, path
        assert '<div id="root">' in response.text, path
        assert response.headers["cache-control"] == NO_CACHE, path


def test_files_and_landing_pages_still_win(tmp_path):
    client = _client(tmp_path)

    assert client.get("/que-jugar-hoy/").text == "<h1>¿Qué jugar hoy?</h1>"
    assert client.get("/api/health").json() == {"status": "ok"}


def test_each_section_is_shared_with_its_own_address(tmp_path):
    """Con og:url de la portada, Facebook y Messenger llevaban el link de una sala a la portada."""
    html = _client(tmp_path).get("/sala/ABC123").text

    assert '<meta property="og:url" content="https://ruletazo.app/sala/ABC123" />' in html


def test_personal_sections_stay_out_of_search_engines(tmp_path):
    client = _client(tmp_path)

    for path in ["/perfil/76561198000000001", "/sala/ABC123", "/biblioteca", "/familia"]:
        assert NOINDEX_TAG in client.get(path).text, path
    for path in ["/", "/foro/juego/620", "/privacidad"]:
        assert NOINDEX_TAG not in client.get(path).text, path


def test_unknown_addresses_show_the_page_with_a_404(tmp_path):
    response = _client(tmp_path).get("/cualquiera")

    assert response.status_code == 404
    assert '<div id="root">' in response.text


def test_api_and_missing_files_keep_a_plain_404(tmp_path):
    client = _client(tmp_path)

    for path in ["/api/nada", "/assets/index-viejo.js", "/wp-login.php"]:
        response = client.get(path)
        assert response.status_code == 404, path
        assert "<html" not in response.text, path


def test_the_address_cannot_inject_html(tmp_path):
    html = _client(tmp_path).get('/perfil/"><script>alert(1)</script>').text

    assert "<script>" not in html
    assert 'content="https://ruletazo.app/perfil/%22%3E%3Cscript%3E' in html


def test_sections_match_the_frontend_routes():
    """Una sección nueva en el frontend sin sumarla acá daría 404 al recargarla."""
    routes = (REPO / "frontend" / "src" / "routes.js").read_text(encoding="utf-8")
    slugs = re.search(r"const VIEW_SLUGS = \{(.*?)\};", routes, re.S)[1]

    assert set(re.findall(r':\s*"([\w-]+)"', slugs)) == APP_SECTIONS


def test_the_real_index_has_the_og_url_the_server_rewrites():
    """Si cambia el formato de la etiqueta en frontend/index.html, la regex dejaría de encontrarla."""
    index = (REPO / "frontend" / "index.html").read_text(encoding="utf-8")

    assert 'content="__SITE_URL__/sala/ABC123"' in page_html(index, "/sala/ABC123", indexable=True)
    assert NOINDEX_TAG in page_html(index, "/sala/ABC123", indexable=False)
