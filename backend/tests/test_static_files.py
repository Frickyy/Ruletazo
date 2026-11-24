"""Encabezados de caché del frontend compilado: el HTML se revalida, los assets con hash duran un año."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.static_files import IMMUTABLE, NO_CACHE, SHORT, FrontendStaticFiles


def _client(tmp_path) -> TestClient:
    (tmp_path / "index.html").write_text("<!doctype html><title>Ruletazo</title>", encoding="utf-8")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "index-abc123.js").write_text("console.log(1)", encoding="utf-8")
    (tmp_path / "que-jugar-hoy").mkdir()
    (tmp_path / "que-jugar-hoy" / "index.html").write_text("<h1>¿Qué jugar hoy?</h1>", encoding="utf-8")
    (tmp_path / "og-image.png").write_bytes(b"\x89PNG")
    app = FastAPI()
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
