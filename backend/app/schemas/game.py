from typing import Literal

from pydantic import BaseModel, Field


class Game(BaseModel):
    """Representa un juego mostrado en la ruleta o en la biblioteca.

    Los campos de enriquecimiento (`genres`, `short_description`, reseñas, HowLongToBeat,
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
    # Frases cortas de las reseñas más útiles de Steam (ver services/review_digest.py).
    review_good: list[str] = Field(default_factory=list)
    review_bad: list[str] = Field(default_factory=list)
    hltb_main_hours: float | None = None
    hltb_completionist_hours: float | None = None
    achievement_difficulty: str = "Sin datos"
    # Reseñas del foro de Ruletazo (solo en la ficha: /games/details).
    community_review_count: int = 0
    community_average_score: float | None = None
