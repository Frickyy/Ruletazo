from app.core import security

STEAM_ID = "76561198000000000"


def test_valid_token_returns_steam_id():
    token = security.create_session_token(STEAM_ID)

    assert security.read_session_token(token) == STEAM_ID


def test_tampered_steam_id_is_rejected():
    token = security.create_session_token(STEAM_ID)
    _, issued, signature = token.split(".")
    forged = f"76561198999999999.{issued}.{signature}"

    assert security.read_session_token(forged) is None


def test_expired_token_is_rejected():
    token = security.create_session_token(STEAM_ID, issued_at=1_000)

    assert security.read_session_token(token, now=1_000 + security.SESSION_MAX_AGE_SECONDS + 1) is None


def test_malformed_tokens_are_rejected():
    for token in (None, "", "abc", "1.2", f"{STEAM_ID}.notanumber.sig", "123.1.sig"):
        assert security.read_session_token(token) is None
