import smtplib

import pytest

from app.core.config import get_settings
from app.models.game import Feedback
from app.services import feedback_service, profile_service


@pytest.fixture()
def smtp_settings(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "smtp_user", "bot@example.com")
    monkeypatch.setattr(settings, "smtp_password", "secret")
    monkeypatch.setattr(settings, "feedback_email", "ruletazo007@gmail.com")
    return settings


class FakeSMTP:
    sent = []
    fail = False

    def __init__(self, host, port, timeout=None):
        self.host, self.port = host, port

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self):
        pass

    def login(self, user, password):
        if FakeSMTP.fail:
            raise smtplib.SMTPAuthenticationError(535, b"bad")

    def send_message(self, message):
        FakeSMTP.sent.append(message)


@pytest.fixture(autouse=True)
def fake_smtp(monkeypatch):
    FakeSMTP.sent, FakeSMTP.fail = [], False
    monkeypatch.setattr(feedback_service.smtplib, "SMTP", FakeSMTP)
    return FakeSMTP


def _save(db, **overrides):
    data = dict(kind="idea", message="  Estaría bueno un modo oscuro  ", steam_id="7656", steam_name="Ana <3", page="#/biblioteca")
    data.update(overrides)
    return feedback_service.save_feedback(db, **data)


def test_feedback_is_saved_and_trimmed(db_session):
    feedback = _save(db_session, kind="raro", message="x" * 5000, steam_name="  Ana\n  Bot ")
    assert feedback.kind == "other"
    assert len(feedback.message) == feedback_service.MAX_MESSAGE
    assert feedback.steam_name == "Ana Bot"
    assert feedback.emailed is False


def test_feedback_email_goes_to_every_address(db_session, smtp_settings, monkeypatch):
    monkeypatch.setattr(get_settings(), "feedback_email", "ruletazo007@gmail.com, otra@gmail.com,,RULETAZO007@gmail.com")
    feedback = _save(db_session)
    assert feedback_service.send_feedback_email(db_session, feedback.id) is True
    assert FakeSMTP.sent[0]["To"] == "ruletazo007@gmail.com, otra@gmail.com"


def test_feedback_email_goes_to_the_inbox(db_session, smtp_settings):
    feedback = _save(db_session)
    assert feedback_service.send_feedback_email(db_session, feedback.id) is True
    message = FakeSMTP.sent[0]
    assert message["To"] == "ruletazo007@gmail.com"
    assert message["Subject"] == "Ana <3 mandó un feedback"
    text = message.get_body("plain").get_content()
    assert "Estaría bueno un modo oscuro" in text and "steamcommunity.com/profiles/7656" in text
    html = message.get_body("html").get_content()
    # El nombre es un link al perfil, escapado para que no rompa el HTML.
    assert '<a href="https://steamcommunity.com/profiles/7656">Ana &lt;3</a>' in html
    assert db_session.get(Feedback, feedback.id).emailed is True
    # No se manda dos veces.
    assert feedback_service.send_feedback_email(db_session, feedback.id) is False
    assert len(FakeSMTP.sent) == 1


def test_feedback_without_smtp_stays_saved(db_session, monkeypatch):
    monkeypatch.setattr(get_settings(), "smtp_password", "")
    feedback = _save(db_session)
    assert feedback_service.send_feedback_email(db_session, feedback.id) is False
    assert FakeSMTP.sent == []
    assert db_session.get(Feedback, feedback.id).emailed is False


def test_feedback_smtp_failure_keeps_it(db_session, smtp_settings):
    FakeSMTP.fail = True
    feedback = _save(db_session)
    assert feedback_service.send_feedback_email(db_session, feedback.id) is False
    assert db_session.get(Feedback, feedback.id).emailed is False


def test_feedback_without_session_is_anonymous(db_session):
    feedback = _save(db_session, steam_id=None, steam_name="Ana")
    assert feedback.steam_name is None
    message = feedback_service.build_email(feedback, "bot@example.com", "ruletazo007@gmail.com")
    assert message["Subject"] == "Alguien sin sesión mandó un feedback"
    assert "steamcommunity.com" not in message.get_body("html").get_content()


def test_feedback_without_steam_name_still_links_profile(db_session):
    feedback = _save(db_session, steam_name=None)
    message = feedback_service.build_email(feedback, "bot@example.com", "ruletazo007@gmail.com")
    assert message["Subject"] == "Jugador de Steam mandó un feedback"
    assert "steamcommunity.com/profiles/7656" in message.get_body("html").get_content()


def test_deleting_data_removes_feedback(db_session):
    _save(db_session, steam_id="7656")
    _save(db_session, steam_id=None)
    profile_service.delete_user_data(db_session, "7656")
    assert db_session.query(Feedback).count() == 1
