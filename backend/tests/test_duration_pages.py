from datetime import datetime, timezone

import httpx
import respx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.db.session import get_db
from app.models.game import CachedGameDetails, DurationPage
from app.routers import duration_pages as pages_router
from app.services import duration_pages, game_details_service


def _details(appid, hours=10.4, reviews=5000, **overrides):
    defaults = dict(
        appid=appid,
        igdb_hours=hours,
        igdb_samples=36,
        igdb_url=f"https://www.igdb.com/games/juego-{appid}",
        igdb_version=game_details_service.IGDB_VERSION,
        review_total=reviews,
        review_score_desc="Muy positivas",
        genres=["Aventura", "Puzles"],
        short_description="Un juego de portales.",
        developer="Valve",
        release_date="2011-04-18",
        store_metadata_version=game_details_service.STORE_METADATA_VERSION,
        fetched_at=datetime.now(timezone.utc),
    )
    defaults.update(overrides)
    return CachedGameDetails(**defaults)


def _client(db_session) -> TestClient:
    app = FastAPI()
    app.include_router(pages_router.router)
    app.dependency_overrides[get_db] = lambda: db_session
    return TestClient(app, follow_redirects=False)


def test_slugs_are_clean_and_never_collide():
    assert duration_pages.slugify("Baldur's Gate 3") == "baldurs-gate-3"
    assert duration_pages.slugify("ELDEN RING™: Nightreign") == "elden-ring-nightreign"
    assert duration_pages.slugify("Pokémon Café") == "pokemon-cafe"
    assert duration_pages.slugify("モンスターハンター") == ""
    used = {"portal-2": 620}
    assert duration_pages.unique_slug("Portal 2", 620, used) == "portal-2"
    assert duration_pages.unique_slug("Portal 2", 999, used) == "portal-2-999"
    assert duration_pages.unique_slug("モンスターハンター", 582010, used) == "582010"


def test_hours_read_naturally():
    assert pages_router.hours_text(36.2) == "unas 36 horas"
    assert pages_router.hours_text(2.5) == "unas 2,5 horas"
    assert pages_router.hours_text(3.04) == "unas 3 horas"
    assert pages_router.hours_text(1.0) == "una hora"
    assert pages_router.hours_text(0.5) == "menos de una hora"
    assert pages_router.short_hours(117.9) == "118 h"
    assert pages_router.short_hours(2.5) == "2,5 h"


async def test_refresh_creates_pages_only_for_credible_popular_games(db_session, monkeypatch):
    db_session.add(DurationPage(appid=50, slug="viejo", name="Viejo"))
    db_session.add(_details(50, hours=12.0))
    db_session.commit()

    async def candidates(db):
        return [620, 1, 2, 3, 4, 50]

    async def store(appids):
        data = {
            620: {"name": "Portal 2", "review_total": 300000},
            1: {"name": "Sin datos en IGDB", "review_total": 9000},
            2: {"name": "Para adultos", "review_total": 9000, "is_adult": True},
            3: {"name": "Casi nadie lo tiene", "review_total": 40},
            4: {"name": "Portal 2", "review_total": 8000},  # mismo nombre que otro: otra dirección
        }
        result = {}
        for appid in appids:
            if appid in data:
                result[appid] = {
                    "store_available": True, "genres": [], "short_description": "", "developer": "", "price_cents": None,
                    "release_date": "", "header_image": "", "is_adult": False, "is_software": False, "player_categories": [],
                    "review_score_desc": "Muy positivas", **data[appid],
                }
        return result

    async def igdb(appids):
        hours = {620: 10.4, 2: 20.0, 3: 5.0, 4: 7.0, 50: None}  # 50 dejó de tener un dato creíble
        return {appid: {"hours": hours.get(appid), "samples": 36, "url": "", "quick_hours": 4.6, "full_hours": None} for appid in appids}

    monkeypatch.setattr(duration_pages, "popular_appids", candidates)
    monkeypatch.setattr(duration_pages.store_browse, "get_items", store)
    monkeypatch.setattr(duration_pages.igdb_client, "get_times", igdb)

    summary = await duration_pages.refresh(db_session)

    slugs = {page.appid: page.slug for page in db_session.query(DurationPage)}
    assert slugs == {620: "portal-2", 4: "portal-2-4"}
    assert summary["created"] == 2 and summary["removed"] == 1
    portal = db_session.get(DurationPage, 620)
    assert (portal.name, portal.quick_hours, portal.full_hours) == ("Portal 2", 4.6, None)
    assert db_session.get(CachedGameDetails, 620).igdb_hours == 10.4


async def test_an_igdb_failure_does_not_remove_pages(db_session, monkeypatch):
    db_session.add(DurationPage(appid=620, slug="portal-2", name="Portal 2"))
    db_session.add(_details(620))
    db_session.commit()

    async def candidates(db):
        return [620]

    async def store(appids):
        return {}

    async def igdb_down(appids):
        return None

    monkeypatch.setattr(duration_pages, "popular_appids", candidates)
    monkeypatch.setattr(duration_pages.store_browse, "get_items", store)
    monkeypatch.setattr(duration_pages.igdb_client, "get_times", igdb_down)

    await duration_pages.refresh(db_session)

    assert db_session.get(DurationPage, 620) is not None


@respx.mock
async def test_candidates_come_from_steam_charts_and_known_popular_games(db_session):
    db_session.add(_details(620, reviews=300000))
    db_session.add(_details(99, reviews=10))  # poco conocido: no entra por la base
    db_session.add(DurationPage(appid=77, slug="ya-tenia", name="Ya tenía"))
    db_session.commit()
    respx.get(duration_pages.MOST_PLAYED_URL).mock(return_value=httpx.Response(200, json={"response": {"ranks": [{"appid": 730}, {"appid": 620}]}}))
    respx.get(duration_pages.TOP_SELLERS_URL).mock(return_value=httpx.Response(500))

    assert await duration_pages.popular_appids(db_session) == [730, 620, 77]


def test_game_page(db_session):
    db_session.add(DurationPage(appid=620, slug="portal-2", name="Portal <2>", quick_hours=4.6, full_hours=27.1))
    db_session.add(_details(620))
    db_session.add(DurationPage(appid=400, slug="portal", name="Portal"))
    db_session.add(_details(400, hours=4.0))
    db_session.commit()

    response = _client(db_session).get("/cuanto-dura/portal-2")

    assert response.status_code == 200
    html = response.text
    assert "<title>¿Cuánto dura Portal &lt;2&gt;? · Ruletazo</title>" in html
    assert "<h1>¿Cuánto dura Portal &lt;2&gt;?</h1>" in html and "Portal <2>" not in html
    assert "Unas 10 horas" in html and "Yendo directo a la historia: unas 4,6 horas" in html and "unas 27 horas" in html
    assert '<link rel="canonical" href="https://ruletazo.app/cuanto-dura/portal-2" />' in html
    assert "36 personas" in html and 'href="https://www.igdb.com/games/juego-620"' in html
    assert '"timeRequired": "PT10H"' in html
    assert 'href="/cuanto-dura/portal"' in html  # otro juego que dura parecido
    assert response.headers["cache-control"] == "public, max-age=3600"


def test_unknown_or_not_credible_game_is_a_404(db_session):
    db_session.add(DurationPage(appid=620, slug="portal-2", name="Portal 2"))
    db_session.add(_details(620, hours=None))
    db_session.commit()
    client = _client(db_session)

    assert client.get("/cuanto-dura/portal-2").status_code == 404
    assert client.get("/cuanto-dura/no-existe").status_code == 404


def test_index_and_sitemap_list_every_page(db_session):
    for appid, slug, hours in [(1, "corto", 2.5), (2, "mediano", 12.0), (3, "largo", 80.0)]:
        db_session.add(DurationPage(appid=appid, slug=slug, name=slug.capitalize()))
        db_session.add(_details(appid, hours=hours))
    db_session.commit()
    client = _client(db_session)

    index = client.get("/cuanto-dura/").text
    assert "Para una tarde" in index and "Para un finde" in index and "Para meses" in index
    assert index.index('href="/cuanto-dura/corto"') < index.index('href="/cuanto-dura/largo"')
    assert "Para unas semanas" not in index  # sin juegos en ese rango

    sitemap = client.get("/cuanto-dura/sitemap.xml")
    assert sitemap.headers["content-type"].startswith("application/xml")
    assert "<loc>https://ruletazo.app/cuanto-dura/</loc>" in sitemap.text
    assert sitemap.text.count("<loc>https://ruletazo.app/cuanto-dura/") == 4

    redirect = client.get("/cuanto-dura")
    assert redirect.status_code == 301 and redirect.headers["location"] == "/cuanto-dura/"
