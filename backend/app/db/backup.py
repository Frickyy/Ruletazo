"""Copias de seguridad automáticas de la base SQLite.

Si BACKUP_DIR está configurado, se guarda una copia al arrancar (si la última tiene más de
un día) y después una por día, conservando las últimas BACKUP_KEEP. Usa la API de backup de
SQLite, que copia la base de forma consistente aunque la app la esté usando.
"""

import asyncio
import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

BACKUP_INTERVAL_SECONDS = 24 * 60 * 60
_PREFIX = "steam_roulette-"


def sqlite_path(database_url: str) -> Path | None:
    """Ruta del archivo de una URL sqlite:///... (None si no es SQLite en archivo)."""
    if not database_url.startswith("sqlite:///") or ":memory:" in database_url:
        return None
    return Path(database_url.removeprefix("sqlite:///"))


def backup_now(database_url: str, backup_dir: str, keep: int = 7) -> Path | None:
    source = sqlite_path(database_url)
    if source is None or not source.exists():
        return None
    target_dir = Path(backup_dir)
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"{_PREFIX}{datetime.now(timezone.utc):%Y%m%d-%H%M%S}.db"
    with sqlite3.connect(source) as src, sqlite3.connect(target) as dst:
        src.backup(dst)
    for old in sorted(target_dir.glob(f"{_PREFIX}*.db"))[:-keep]:
        old.unlink(missing_ok=True)
    logger.info("Copia de seguridad guardada en %s", target)
    return target


def latest_backup_age_seconds(backup_dir: str) -> float | None:
    backups = sorted(Path(backup_dir).glob(f"{_PREFIX}*.db"))
    if not backups:
        return None
    return datetime.now(timezone.utc).timestamp() - backups[-1].stat().st_mtime


async def backup_loop(database_url: str, backup_dir: str, keep: int) -> None:
    age = latest_backup_age_seconds(backup_dir)
    wait = 0 if age is None or age >= BACKUP_INTERVAL_SECONDS else BACKUP_INTERVAL_SECONDS - age
    while True:
        await asyncio.sleep(wait)
        try:
            await asyncio.to_thread(backup_now, database_url, backup_dir, keep)
        except Exception:
            logger.exception("No se pudo guardar la copia de seguridad")
        wait = BACKUP_INTERVAL_SECONDS
