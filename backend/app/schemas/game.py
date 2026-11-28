from typing import Literal

from pydantic import BaseModel, Field


class CriticScore(BaseModel):
    """Un puntaje de 0 a 100 para la tarjeta (ver game_details_service.critic_scores)."""

    # "metacritic", "igdb_critics", "igdb_users" o "steam".
    source: str
    score: int
    # Críticas, votos o reseñas detrás del puntaje (0 si la fuente no lo dice).
    count: int = 0
    url: str = ""


class Game(BaseModel):
    """Representa un juego mostrado en la ruleta o en la biblioteca.

    Los campos de enriquecimiento (`genres`, `short_description`, reseñas, duración,
    dificultad de logros) tienen default porque solo están completos una vez que
    `game_details_service` clasificó ese appid (ver services/game_details_service.py).
    """

    appid: int
    name: str
    header_image: str
    genres: list[str] = Field(default_factory=list)
    short_description: str = ""
    developer: str = ""
    playtime_forever_minutes: int = 0
    is_favorite: bool = False
    # "No me lo muestres más": queda fuera de la ruleta, se puede restaurar desde la biblioteca.
    is_hidden: bool = False
    # Contenido sexual para adultos según la tienda (o, si todavía no hay datos, por el nombre).
    is_adult: bool = False
    # La tienda lo lista como software (programas, utilidades), no como juego.
    is_software: bool = False
    # Última vez que se jugó (timestamp Unix). None si nunca.
    last_played: int | None = None
    # "playing", "finished", "abandoned" o None.
    state: str | None = None
    # Modos de juego según la tienda.
    single_player: bool = False
    coop: bool = False
    multiplayer: bool = False
    local_multiplayer: bool = False
    # Tus logros en este juego (None si no se sabe todavía o no tiene logros).
    achievements_unlocked: int | None = None
    achievements_total: int | None = None
    # De qué biblioteca viene: la propia, la de un familiar combinado, o ambas (mismo appid en las dos).
    source: Literal["you", "friend", "both"] = "you"
    price_cents: int | None = None
    release_date: str = ""
    review_score_desc: str = ""
    review_total: int = 0
    # Ya hay datos de la tienda con la versión actual: hasta entonces no se sabe cuántas reseñas tiene
    # (la opción "Ocultar juegos basura" no esconde un juego sin estos datos).
    store_data: bool = False
    # Metacritic, crítica y usuarios de IGDB, usuarios de Steam (los que haya).
    critics: list[CriticScore] = Field(default_factory=list)
    # Frases cortas de las reseñas más útiles de Steam (ver services/review_digest.py).
    review_good: list[str] = Field(default_factory=list)
    review_bad: list[str] = Field(default_factory=list)
    # Duración que muestra la página: "igdb" o "community" (mediana de quienes lo terminaron).
    duration_hours: float | None = None
    duration_source: str | None = None
    # Personas detrás del dato (en IGDB o en Ruletazo) y, con IGDB, el link a la ficha del juego allá.
    duration_samples: int = 0
    duration_url: str = ""
    # Directo a la historia según IGDB (sin extras).
    duration_quick_hours: float | None = None
    # Completista según IGDB: horas para sacar todos los logros (el 100 %, el "platino").
    duration_full_hours: float | None = None
    achievement_difficulty: str = "Sin datos"
    # Reseñas del foro de Ruletazo (solo en la ficha: /games/details).
    community_review_count: int = 0
    community_average_score: float | None = None
