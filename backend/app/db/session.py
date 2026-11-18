from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings

settings = get_settings()

# SQLite exige check_same_thread=False para poder usarse desde los distintos
# threads con los que FastAPI atiende requests.
_connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(settings.database_url, connect_args=_connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Clase base declarativa: todos los modelos ORM (caché) heredan de acá."""


def init_db() -> None:
    """Crea en la DB las tablas que falten, según los modelos declarados. No borra datos existentes."""
    from app.models import forum, game  # noqa: F401  (registra los modelos en Base.metadata)

    Base.metadata.create_all(bind=engine)
    _upgrade_game_details_table()


def _upgrade_game_details_table() -> None:
    """Adds new nullable metadata columns to existing SQLite databases."""
    if not settings.database_url.startswith("sqlite"):
        return
    columns = {column["name"] for column in inspect(engine).get_columns("cached_game_details")}
    with engine.begin() as connection:
        if "price_cents" not in columns:
            connection.execute(text("ALTER TABLE cached_game_details ADD COLUMN price_cents INTEGER"))
        if "release_date" not in columns:
            connection.execute(text("ALTER TABLE cached_game_details ADD COLUMN release_date VARCHAR(32) DEFAULT ''"))
        if "store_metadata_version" not in columns:
            connection.execute(text("ALTER TABLE cached_game_details ADD COLUMN store_metadata_version INTEGER DEFAULT 0"))
        if "developer" not in columns:
            connection.execute(text("ALTER TABLE cached_game_details ADD COLUMN developer VARCHAR(255) DEFAULT ''"))
        if "review_pros" not in columns:
            connection.execute(text("ALTER TABLE cached_game_details ADD COLUMN review_pros TEXT DEFAULT ''"))
        if "review_cons" not in columns:
            connection.execute(text("ALTER TABLE cached_game_details ADD COLUMN review_cons TEXT DEFAULT ''"))
        if "reviews_version" not in columns:
            connection.execute(text("ALTER TABLE cached_game_details ADD COLUMN reviews_version INTEGER DEFAULT 0"))


def get_db() -> Generator[Session, None, None]:
    """Dependencia de FastAPI: entrega una sesión de DB por request y la cierra al terminar."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
