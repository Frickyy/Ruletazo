"""Las páginas "¿Cuánto dura…?" (HTML hecho acá, sin la app de React): una por juego, un índice
y su sitemap. Qué juegos tienen página lo decide services/duration_pages.py."""

import json
import re
from html import escape

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services import duration_pages
from app.services.duration_pages import PageEntry

router = APIRouter(tags=["cuanto-dura"])

SITE = "https://ruletazo.app"
BASE = "/cuanto-dura/"
CACHE = {"Cache-Control": "public, max-age=3600"}
# Rangos del índice, en horas: [desde, hasta).
RANGES = [
    ("Para una tarde", "menos de 5 horas", 0, 5),
    ("Para un finde", "de 5 a 15 horas", 5, 15),
    ("Para unas semanas", "de 15 a 40 horas", 15, 40),
    ("Para meses", "más de 40 horas", 40, float("inf")),
]
STYLE = """
.crumbs{margin:34px 0 0;font-size:15px}.crumbs a{color:var(--muted)}
h1{margin-top:12px}
.answer{display:grid;gap:4px;margin:6px 0 18px;padding:20px 22px;border:1px solid var(--line);border-radius:14px;background:var(--card)}
.answer strong{font-size:clamp(30px,6vw,42px);line-height:1.1;color:var(--accent)}
.answer span{color:var(--muted)}
.times{margin:0 0 6px;padding-left:20px;color:#ddd6ce}
.source{color:var(--muted);font-size:15px;margin:0 0 22px}
.cover{display:block;width:100%;max-width:460px;height:auto;border-radius:12px;margin:8px 0 10px}
.facts{color:var(--muted);margin:0 0 4px;font-size:16px}
.ctabox{margin:34px 0 0;padding:22px;border:1px solid var(--line);border-radius:14px;background:var(--card)}
.ctabox p{margin:6px 0 14px;color:#ddd6ce}.ctabox .cta{margin:0}
.games{list-style:none;margin:8px 0 0;padding:0;columns:2 240px;column-gap:24px}
.games li{break-inside:avoid;margin:0 0 6px}.games small{color:var(--muted)}
"""


def hours_text(hours: float) -> str:
    """36 → "unas 36 horas"; 2,5 → "unas 2,5 horas"; menos de una hora → "menos de una hora"."""
    if hours < 1:
        return "menos de una hora"
    value = round(hours) if hours >= 10 or float(round(hours, 1)).is_integer() else round(hours, 1)
    number = f"{value:g}".replace(".", ",")
    return "una hora" if number == "1" else f"unas {number} horas"


def short_hours(hours: float) -> str:
    """Para las listas: "36 h", "2,5 h", "< 1 h"."""
    if hours < 1:
        return "< 1 h"
    value = round(hours) if hours >= 10 else round(hours, 1)
    return f"{value:g}".replace(".", ",") + " h"


def display_name(name: str) -> str:
    """El nombre sin ™, ® ni ©, que en los resultados de Google se ven feos
    ("Middle-earth™: Shadow of War™" → "Middle-earth: Shadow of War")."""
    return re.sub(r"\s{2,}", " ", re.sub(r"[™®©]", "", name)).strip()


def _thousands(number: int) -> str:
    return f"{number:,}".replace(",", ".")


def _json_ld(data: dict) -> str:
    # Sin <, > ni & crudos: un nombre con "</script>" no puede cerrar el bloque antes de tiempo.
    text = json.dumps(data, ensure_ascii=False)
    return text.replace("&", "\\u0026").replace("<", "\\u003c").replace(">", "\\u003e")


def _layout(*, title: str, description: str, path: str, body: str, image: str = f"{SITE}/og-image.png", json_ld: dict | None = None) -> str:
    url = f"{SITE}{path}"
    ld = f'<script type="application/ld+json">{_json_ld(json_ld)}</script>\n' if json_ld else ""
    return f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{escape(title)}</title>
<meta name="description" content="{escape(description)}" />
<link rel="canonical" href="{escape(url)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Ruletazo" />
<meta property="og:title" content="{escape(title)}" />
<meta property="og:description" content="{escape(description)}" />
<meta property="og:url" content="{escape(url)}" />
<meta property="og:image" content="{escape(image)}" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="stylesheet" href="/landing.css" />
<style>{STYLE}</style>
{ld}</head>
<body>
<header><a href="/"><img src="/favicon.svg" alt="" />Ruletazo</a></header>
<main>
{body}
</main>
<footer>Duración según <a href="https://www.igdb.com/">IGDB</a>, una base de datos de juegos que arma su comunidad. Datos de los juegos de la tienda de Steam. Ruletazo es gratis y sin anuncios. Proyecto independiente, sin relación con Valve Corporation ni Steam.</footer>
</body>
</html>
"""


def _cover(entry: PageEntry) -> str:
    return entry.details.header_image or f"https://cdn.cloudflare.steamstatic.com/steam/apps/{entry.page.appid}/header.jpg"


def _game_link(entry: PageEntry) -> str:
    return f'<li><a href="{BASE}{escape(entry.page.slug)}">{escape(display_name(entry.page.name))}</a> <small>{short_hours(entry.hours)}</small></li>'


def render_page(entry: PageEntry, related: list[PageEntry]) -> str:
    page, details = entry.page, entry.details
    name = display_name(page.name)
    times = []
    if page.quick_hours is not None:
        times.append(f"<li>Yendo directo a la historia: {hours_text(page.quick_hours)}</li>")
    if page.full_hours is not None:
        times.append(f"<li>Al 100 %, con todo: {hours_text(page.full_hours)}</li>")
    year = (re.search(r"\d{4}", details.release_date or "") or [None])[0]
    facts = " · ".join(escape(part) for part in [", ".join(details.genres or []), year, details.developer] if part)
    reviews = (
        f'<p class="facts">Reseñas en Steam: {escape(details.review_score_desc)} ({_thousands(details.review_total)} reseñas)</p>'
        if details.review_score_desc and details.review_total else ""
    )
    source_link = f'<a href="{escape(details.igdb_url)}">IGDB</a>' if details.igdb_url else '<a href="https://www.igdb.com/">IGDB</a>'
    people = f"{details.igdb_samples} personas" if details.igdb_samples != 1 else "una persona"
    synopsis = f"<section><h2>De qué se trata</h2><p>{escape(details.short_description)}</p></section>" if details.short_description else ""
    body = f"""<p class="crumbs"><a href="{BASE}">Cuánto dura cada juego</a></p>
<h1>¿Cuánto dura {escape(name)}?</h1>
<div class="answer"><strong>{hours_text(entry.hours).capitalize()}</strong><span>para terminarlo, con la historia y algunos extras</span></div>
{f'<ul class="times">{"".join(times)}</ul>' if times else ""}
<p class="source">Según lo que cargaron {people} en {source_link}. Es un promedio: cada uno juega a su ritmo.</p>
<img class="cover" src="{escape(_cover(entry))}" alt="{escape(name)}" width="460" height="215" loading="lazy" />
{f'<p class="facts">{facts}</p>' if facts else ""}
{reviews}
<p class="facts"><a href="https://store.steampowered.com/app/{page.appid}/">Ver en Steam</a></p>
{synopsis}
<div class="ctabox"><strong>¿Lo tenés en Steam?</strong><p>Pegá tu perfil y dejá que la ruleta elija qué jugar hoy: te muestra cuánto dura cada juego antes de empezarlo. Gratis y sin anuncios.</p><a class="cta" href="/">Girar la ruleta gratis →</a></div>
<div class="more"><strong>Otros juegos que duran parecido</strong><ul class="games">{"".join(_game_link(other) for other in related)}</ul><p><a href="{BASE}">Ver todos los juegos</a></p></div>"""
    description = (
        f"{name} se termina en {hours_text(entry.hours)}, según lo que cargaron {people} en IGDB. "
        "Mirá cuánto dura antes de empezarlo y dejá que la ruleta elija qué jugar de tu biblioteca de Steam."
    )
    json_ld = {
        "@context": "https://schema.org",
        "@type": "VideoGame",
        "name": name,
        "url": f"{SITE}{BASE}{page.slug}",
        "image": _cover(entry),
        "timeRequired": f"PT{max(1, round(entry.hours))}H",
        "inLanguage": "es",
    }
    if details.genres:
        json_ld["genre"] = details.genres
    if details.developer:
        json_ld["author"] = {"@type": "Organization", "name": details.developer}
    return _layout(
        title=f"¿Cuánto dura {name}? · Ruletazo",
        description=description,
        path=f"{BASE}{page.slug}",
        body=body,
        image=_cover(entry),
        json_ld=json_ld,
    )


def render_index(all_entries: list[PageEntry]) -> str:
    sections = []
    for title, label, low, high in RANGES:
        group = [entry for entry in all_entries if low <= entry.hours < high]
        if group:
            sections.append(f'<section><h2>{title} <small>({label})</small></h2><ul class="games">{"".join(_game_link(entry) for entry in group)}</ul></section>')
    body = f"""<h1>¿Cuánto dura cada juego?</h1>
<p class="lead">Cuántas horas se tarda en terminar {len(all_entries)} juegos populares de Steam, según IGDB. Para elegir uno que entre en tu semana.</p>
<a class="cta" href="/">Girar la ruleta gratis →</a>
{"".join(sections)}
<div class="ctabox"><strong>¿No sabés cuál empezar?</strong><p>Ruletazo elige por vos un juego de tu biblioteca de Steam y te muestra cuánto dura antes de arrancar.</p><a class="cta" href="/">Probar Ruletazo</a></div>"""
    return _layout(
        title="¿Cuánto dura cada juego? Horas para terminar juegos de Steam · Ruletazo",
        description=f"Cuántas horas se tarda en terminar {len(all_entries)} juegos populares de Steam, de los más cortos a los más largos, según IGDB.",
        path=BASE,
        body=body,
    )


def render_not_found() -> str:
    body = f"""<h1>No encontramos ese juego</h1>
<p class="lead">Puede que todavía no tenga página o que la dirección esté mal escrita.</p>
<a class="cta" href="{BASE}">Ver todos los juegos</a>"""
    return _layout(title="Juego no encontrado · Ruletazo", description="Ese juego todavía no tiene página.", path=BASE, body=body)


@router.get("/cuanto-dura/sitemap.xml", include_in_schema=False)
def sitemap(db: Session = Depends(get_db)) -> Response:
    urls = [f"{SITE}{BASE}"] + [f"{SITE}{BASE}{entry.page.slug}" for entry in duration_pages.entries(db)]
    body = "".join(f"  <url><loc>{escape(url)}</loc></url>\n" for url in urls)
    xml = f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{body}</urlset>\n'
    return Response(xml, media_type="application/xml", headers=CACHE)


@router.get("/cuanto-dura", include_in_schema=False)
def index_without_slash() -> RedirectResponse:
    # Sin esto la atrapaba el frontend (que devuelve su página de "no existe").
    return RedirectResponse(BASE, status_code=301)


@router.get("/cuanto-dura/", response_class=HTMLResponse, include_in_schema=False)
def index(db: Session = Depends(get_db)) -> HTMLResponse:
    return HTMLResponse(render_index(duration_pages.entries(db)), headers=CACHE)


@router.get("/cuanto-dura/{slug}", response_class=HTMLResponse, include_in_schema=False)
def game_page(slug: str, db: Session = Depends(get_db)) -> HTMLResponse:
    entry = duration_pages.entry_by_slug(db, slug)
    if entry is None:
        return HTMLResponse(render_not_found(), status_code=404, headers={"Cache-Control": "no-cache"})
    return HTMLResponse(render_page(entry, duration_pages.related(duration_pages.entries(db), entry)), headers=CACHE)
