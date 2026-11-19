from collections.abc import Generator

from sqlalchemy import create_engine
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
    """Crea o actualiza las tablas aplicando las migraciones pendientes. No borra datos."""
    from app.db.migrations import run_migrations

    run_migrations(engine)


def get_db() -> Generator[Session, None, None]:
    """Dependencia de FastAPI: entrega una sesión de DB por request y la cierra al terminar."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
