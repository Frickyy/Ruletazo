"""Estadísticas de uso anónimas: solo se cuenta cuántas veces pasa cada paso por día."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.session import get_db
from app.models.game import UsageCounter
from app.routers import usage
from app.services import usage_service


def _counts(db_session) -> dict:
    return {(row.day, row.event): row.count for row in db_session.execute(select(UsageCounter)).scalars()}


def test_record_adds_one_per_event_and_day(db_session):
    usage_service.record(db_session, "spin", day="2026-11-24")
    usage_service.record(db_session, "spin", day="2026-11-24")
    usage_service.record(db_session, "visit", day="2026-11-24")
    usage_service.record(db_session, "spin", day="2026-11-25")

    assert _counts(db_session) == {
        ("2026-11-24", "spin"): 2,
        ("2026-11-24", "visit"): 1,
        ("2026-11-25", "spin"): 1,
    }


def test_unknown_events_are_not_recorded(db_session):
    with pytest.raises(ValueError):
        usage_service.record(db_session, "anything")
    assert _counts(db_session) == {}


def test_day_follows_argentina_time():
    # 01:30 UTC del 25 son las 22:30 del 24 en Argentina.
    from datetime import datetime, timezone

    assert datetime(2026, 11, 25, 1, 30, tzinfo=timezone.utc).astimezone(usage_service.ARGENTINA).date().isoformat() == "2026-11-24"


def test_every_event_the_frontend_sends_is_accepted():
    """Un evento nuevo en el frontend que el backend no conoce se perdería en silencio (422)."""
    import re
    from pathlib import Path

    src = Path(__file__).resolve().parents[2] / "frontend" / "src"
    sent = set()
    for path in src.rglob("*.js*"):
        if "__tests__" in path.parts:
            continue
        for call in re.findall(r"\btrack(?:Once)?\(([^)]*)\)", path.read_text(encoding="utf-8")):
            sent |= set(re.findall(r'"([a-z_]+)"', call))
    assert sent, "no se encontró ningún track(...) en el frontend"
    assert sent <= usage_service.EVENTS, sent - usage_service.EVENTS


def _client(db_session, monkeypatch, moderator=False) -> TestClient:
    app = FastAPI()
    app.include_router(usage.router)
    app.dependency_overrides[get_db] = lambda: db_session
    monkeypatch.setattr(usage, "is_moderator", lambda steam_id: moderator)
    usage.events_limit.reset()
    return TestClient(app)


def test_events_endpoint_counts_known_events(db_session, monkeypatch):
    client = _client(db_session, monkeypatch)

    assert client.post("/api/events", json={"event": "guest_submit"}).status_code == 204
    assert client.post("/api/events", json={"event": "nope"}).status_code == 422

    assert _counts(db_session) == {(usage_service.today(), "guest_submit"): 1}


def test_maintainer_activity_is_not_counted(db_session, monkeypatch):
    client = _client(db_session, monkeypatch, moderator=True)

    assert client.post("/api/events", json={"event": "spin"}).status_code == 204
    assert _counts(db_session) == {}
