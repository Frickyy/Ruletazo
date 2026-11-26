"""Aplica las migraciones de Alembic al arrancar el backend.

- Base nueva (sin tablas): se crea entera con las migraciones.
- Base creada antes de usar Alembic (tiene tablas pero no `alembic_version`): se le agregan
  las columnas que la versión vieja sumaba a mano, se marca como revisión 0001 (el esquema
  que ya tiene) y se aplican las migraciones siguientes.
- Base ya migrada: solo se aplican las pendientes.
"""

import logging
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, inspect, text

logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parents[2]
BASELINE_REVISION = "0001"

# Columnas que la versión anterior agregaba con ALTER TABLE a `cached_game_details`.
_LEGACY_DETAIL_COLUMNS = {
    "price_cents": "INTEGER",
    "release_date": "VARCHAR(32) DEFAULT ''",
    "store_metadata_version": "INTEGER DEFAULT 0",
    "developer": "VARCHAR(255) DEFAULT ''",
    "review_pros": "TEXT DEFAULT ''",
    "review_cons": "TEXT DEFAULT ''",
    "reviews_version": "INTEGER DEFAULT 0",
}


def run_migrations(engine: Engine) -> None:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        tables = set(inspect(connection).get_table_names())
        if tables and "alembic_version" not in tables:
            logger.info("Base creada antes de Alembic: se marca como revisión %s", BASELINE_REVISION)
            _add_legacy_columns(connection, tables)
            command.stamp(config, BASELINE_REVISION)
        command.upgrade(config, "head")


def _add_legacy_columns(connection, tables: set[str]) -> None:
    if "cached_game_details" not in tables:
        return
    existing = {column["name"] for column in inspect(connection).get_columns("cached_game_details")}
    for name, definition in _LEGACY_DETAIL_COLUMNS.items():
        if name not in existing:
            connection.execute(text(f"ALTER TABLE cached_game_details ADD COLUMN {name} {definition}"))
