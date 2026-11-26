import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import Base


@pytest.fixture()
def db_session():
    """Sesión SQLite en memoria, aislada por test (no toca steam_roulette.db)."""
    from app.models import forum, game, room  # noqa: F401  registra los modelos en Base.metadata

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def _no_throttle(monkeypatch):
    """Sin pausas entre pedidos ni servicios enfriados entre un test y otro."""
    from app.services import igdb_client, throttle

    throttle.reset()
    igdb_client.reset()
    monkeypatch.setattr(throttle, "MIN_INTERVAL_SECONDS", {})
    yield
    throttle.reset()
