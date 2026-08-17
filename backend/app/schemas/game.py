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
    playtime_forever_minutes: int = 0
    is_favorite: bool = False
    # De qué biblioteca viene: la propia, la de un familiar combinado, o ambas (mismo appid en las dos).
    source: Literal["you", "friend", "both"] = "you"
    review_score_desc: str = ""
    review_total: int = 0
    featured_reviews: list[str] = Field(default_factory=list)
    hltb_main_hours: float | None = None
    hltb_completionist_hours: float | None = None
    achievement_difficulty: str = "Sin datos"
