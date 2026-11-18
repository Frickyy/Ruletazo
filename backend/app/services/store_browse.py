"""Datos de la tienda de a muchos juegos por pedido (IStoreBrowseService/GetItems).

Es el servicio que usa la propia tienda de Steam: con un solo pedido trae descripción,
desarrollador, fecha, portada, precio, descriptores de contenido, etiquetas y categorías
(un jugador, cooperativo, multijugador) de hasta 50 juegos. No necesita API key.

Reemplaza a /api/appdetails para clasificar la biblioteca: aquel acepta un juego por pedido
y obligaba a ir de a uno con pausas (más de una hora para una biblioteca de mil juegos).
"""

import json
from datetime import datetime, timezone

import httpx

from app.services import throttle
from app.services.store_client import is_adult_content

STORE_BROWSE_URL = "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/"
ASSET_BASE_URL = "https://shared.akamai.steamstatic.com/store_item_assets/"
MAX_ITEMS_PER_REQUEST = 50

# Etiquetas de Steam que se usan como "géneros" (las demás —"Un jugador", "2D", "Adorables"…—
# describen otras cosas y llenarían el filtro de ruido). Nombres como los muestra la tienda en español.
GENRE_TAGS = {
    19: "Acción", 21: "Aventura", 122: "Rol", 9: "Estrategia", 599: "Simulación", 701: "Deportes",
    699: "Carreras", 492: "Indie", 597: "Casuales", 128: "Multijugador masivo", 1625: "Plataformas",
    1664: "Puzles", 1663: "FPS", 1774: "Disparos", 1667: "Terror", 1662: "Supervivencia",
    1695: "Mundo abierto", 1716: "Roguelike", 3959: "Roguelite", 1628: "Metroidvania",
    3799: "Novelas visuales", 1752: "Ritmo", 1743: "Lucha", 3810: "Sandbox", 4434: "Rol japonés",
    1708: "Tácticos", 4328: "Construcción de ciudades", 29482: "Tipo Dark Souls", 1666: "Juegos de cartas",
    1741: "Estrategia por turnos", 1645: "Defensa de torres",
}
MAX_GENRES = 5

# Categorías de "jugadores" de la tienda.
SINGLE_PLAYER = {2}
COOP = {9, 38, 39, 48}  # cooperativo, en línea, pantalla compartida, LAN
MULTIPLAYER = {1, 27, 36, 37, 47, 49, 20}  # multijugador, multiplataforma, JcJ en línea/local/LAN, MMO
LOCAL = {24, 37, 39}  # pantalla compartida (cooperativo o JcJ)

_DATA_REQUEST = {
    "include_basic_info": True,
    "include_release": True,
    "include_assets": True,
    "include_categories": True,
    "include_tag_count": 20,
    "include_all_purchase_options": True,
}


async def get_items(appids: list[int], language: str = "spanish") -> dict[int, dict]:
    """Datos de varios juegos. Los que no se pudieron pedir (red, rate limit) vienen con
    `fetch_failed=True`; los que la tienda ya no tiene, con `store_available=False`."""
    result: dict[int, dict] = {}
    async with httpx.AsyncClient(timeout=20) as client:
        for offset in range(0, len(appids), MAX_ITEMS_PER_REQUEST):
            chunk = appids[offset : offset + MAX_ITEMS_PER_REQUEST]
            items = await _fetch_chunk(client, chunk, language)
            for appid in chunk:
                if items is None:
                    result[appid] = {**empty_details(), "fetch_failed": True}
                else:
                    result[appid] = parse_item(items.get(appid))
    return result


async def _fetch_chunk(client: httpx.AsyncClient, appids: list[int], language: str) -> dict[int, dict] | None:
    payload = {
        "ids": [{"appid": appid} for appid in appids],
        "context": {"language": language, "country_code": "US"},
        "data_request": _DATA_REQUEST,
    }
    try:
        await throttle.wait_turn("storebrowse")
        response = await client.get(STORE_BROWSE_URL, params={"input_json": json.dumps(payload)})
    except (throttle.ServiceCoolingDown, httpx.HTTPError):
        return None
    if response.status_code == 429:
        throttle.cool_down("storebrowse")
        return None
    try:
        response.raise_for_status()
        items = response.json().get("response", {}).get("store_items", [])
    except (httpx.HTTPError, ValueError):
        return None
    return {item.get("appid"): item for item in items if item.get("appid")}


def parse_item(item: dict | None) -> dict:
    """Un `store_item` de GetItems al mismo formato que usa el resto de la app."""
    if not item or item.get("success") != 1:
        return empty_details()

    basic = item.get("basic_info") or {}
    categories = set((item.get("categories") or {}).get("supported_player_categoryids") or [])
    is_game = item.get("type", 0) == 0
    if not is_game:
        price_cents = None
    elif item.get("is_free"):
        price_cents = 0
    else:
        price_cents = (item.get("best_purchase_option") or {}).get("final_price_in_cents")
        price_cents = int(price_cents) if price_cents is not None else None

    return {
        "name": item.get("name", ""),
        "genres": genres_from_tags(item.get("tags") or []),
        "short_description": basic.get("short_description", ""),
        "developer": ", ".join(dev.get("name", "") for dev in basic.get("developers") or [] if dev.get("name")),
        "price_cents": price_cents,
        "release_date": _release_date((item.get("release") or {}).get("steam_release_date")),
        "header_image": _header_image(item.get("assets") or {}),
        "is_adult": is_adult_content({"content_descriptors": {"ids": item.get("content_descriptorids") or []}}),
        "player_categories": sorted(categories),
        "store_available": True,
    }


def genres_from_tags(tags: list[dict]) -> list[str]:
    """Las etiquetas de género del juego, de la más votada a la menos."""
    ordered = sorted(tags, key=lambda tag: tag.get("weight", 0), reverse=True)
    names = [GENRE_TAGS[tag["tagid"]] for tag in ordered if tag.get("tagid") in GENRE_TAGS]
    return names[:MAX_GENRES]


def player_modes(categories: list[int] | None) -> dict:
    """Qué modos de juego tiene, a partir de las categorías de la tienda."""
    ids = set(categories or [])
    return {
        "single_player": bool(ids & SINGLE_PLAYER),
        "coop": bool(ids & COOP),
        "multiplayer": bool(ids & (MULTIPLAYER | COOP)),
        "local_multiplayer": bool(ids & LOCAL),
    }


def empty_details() -> dict:
    return {
        "name": "",
        "genres": [],
        "short_description": "",
        "developer": "",
        "price_cents": None,
        "release_date": "",
        "header_image": "",
        "is_adult": False,
        "player_categories": [],
        "store_available": False,
    }


def _release_date(timestamp: int | None) -> str:
    if not timestamp:
        return ""
    return datetime.fromtimestamp(int(timestamp), tz=timezone.utc).date().isoformat()


def _header_image(assets: dict) -> str:
    url_format = assets.get("asset_url_format")
    header = assets.get("header")
    if not url_format or not header:
        return ""
    return ASSET_BASE_URL + url_format.replace("${FILENAME}", header)
