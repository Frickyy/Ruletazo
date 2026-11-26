"""Cuánto dura un juego, según quienes lo terminaron en Ruletazo.

Cuando alguien marca un juego como "Terminado", se guardan las horas que tiene en Steam en ese
momento (una muestra por persona y juego). La duración de un juego es la mediana de esas muestras:
la mediana y no el promedio, porque las horas de Steam incluyen tiempo en menús o con el juego
abierto, y alguien que lo dejó corriendo una semana no debe correr el número.

Solo se muestra con al menos MIN_SAMPLES personas, y nunca por persona: es un dato agregado.
Antes se usa IGDB, si hay claves y tiene un dato creíble (ver igdb_client), y antes que todo
HowLongToBeat, si está activado (HLTB_ENABLED) y tiene el dato.
"""

from datetime import datetime, timezone
from statistics import median

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.game import CachedGameDetails, CachedLibraryEntry, CompletionSample
from app.services import igdb_client

MIN_SAMPLES = 3
# Menos de media hora no es "terminarlo": suele ser un juego marcado por error o con horas fuera de Steam.
MIN_MINUTES = 30


def record_finish(db: Session, steam_id: str, appid: int) -> None:
    """Guarda (o actualiza) la muestra de quien acaba de marcar el juego como terminado."""
    minutes = db.execute(
        select(CachedLibraryEntry.playtime_forever_minutes).where(
            CachedLibraryEntry.steam_id == steam_id, CachedLibraryEntry.appid == appid
        )
    ).scalar()
    if minutes is None or minutes < MIN_MINUTES:
        # Juego de un familiar (no tenemos sus horas) o con muy pocas: no cuenta.
        forget_finish(db, steam_id, appid)
        return
    sample = db.get(CompletionSample, (steam_id, appid))
    if sample is None:
        db.add(CompletionSample(steam_id=steam_id, appid=appid, minutes=minutes, created_at=datetime.now(timezone.utc)))
    else:
        sample.minutes = minutes
        sample.created_at = datetime.now(timezone.utc)


def forget_finish(db: Session, steam_id: str, appid: int) -> None:
    db.execute(delete(CompletionSample).where(CompletionSample.steam_id == steam_id, CompletionSample.appid == appid))


def community_durations(db: Session, appids: list[int]) -> dict[int, tuple[float, int]]:
    """{appid: (horas medianas, cuántas personas)} para los juegos con suficientes muestras."""
    if not appids:
        return {}
    samples: dict[int, list[int]] = {}
    for appid, minutes in db.execute(
        select(CompletionSample.appid, CompletionSample.minutes).where(CompletionSample.appid.in_(appids))
    ):
        samples.setdefault(appid, []).append(minutes)
    return {
        appid: (round(median(values) / 60, 1), len(values))
        for appid, values in samples.items()
        if len(values) >= MIN_SAMPLES
    }


def durations(db: Session, appids: list[int]) -> dict[int, dict]:
    """La duración que muestra la página, de la primera fuente que la tenga: HowLongToBeat (si está
    activado), IGDB (si hay claves; con el link a su ficha en "url") o quienes lo terminaron en Ruletazo."""
    settings = get_settings()
    result: dict[int, dict] = {}
    if settings.hltb_enabled and appids:
        for appid, hours in db.execute(
            select(CachedGameDetails.appid, CachedGameDetails.hltb_main_hours).where(CachedGameDetails.appid.in_(appids))
        ):
            if hours is not None:
                result[appid] = {"hours": hours, "source": "hltb", "samples": 0}
    pending = [appid for appid in appids if appid not in result]
    if settings.igdb_configured and pending:
        for appid, hours, samples, url, categories, genres in db.execute(
            select(
                CachedGameDetails.appid,
                CachedGameDetails.igdb_hours,
                CachedGameDetails.igdb_samples,
                CachedGameDetails.igdb_url,
                CachedGameDetails.player_categories,
                CachedGameDetails.genres,
            ).where(CachedGameDetails.appid.in_(pending))
        ):
            # Sin el tiempo rápido (no se guarda en la ficha) se revisa lo demás: juegos sin final, MMO…
            if igdb_client.makes_sense(hours, samples=samples, categories=categories, genres=genres, check_quick=False):
                result[appid] = {"hours": hours, "source": "igdb", "samples": samples, "url": url}
    for appid, (hours, count) in community_durations(db, [appid for appid in appids if appid not in result]).items():
        result[appid] = {"hours": hours, "source": "community", "samples": count}
    return result
