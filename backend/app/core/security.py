"""Sesión firmada con HMAC para identificar al usuario que inició sesión con Steam.

El backend guarda el SteamID en una cookie HttpOnly con la forma `steamid.emitido.firma`.
La firma (HMAC-SHA256 con SESSION_SECRET) impide que alguien cambie el SteamID a mano,
que era el problema de pasar el SteamID por la URL o por localStorage.
"""

import hashlib
import hmac
import logging
import secrets
import time

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db

logger = logging.getLogger(__name__)

SESSION_COOKIE = "sr_session"
SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

_fallback_secret: str | None = None


def _secret() -> bytes:
    global _fallback_secret
    configured = get_settings().session_secret
    if configured:
        return configured.encode()
    if _fallback_secret is None:
        _fallback_secret = secrets.token_hex(32)
        logger.warning("SESSION_SECRET no está configurada: las sesiones se pierden al reiniciar el backend.")
    return _fallback_secret.encode()


def _signature(payload: str) -> str:
    return hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()


def create_session_token(steam_id: str, issued_at: int | None = None) -> str:
    issued = int(time.time()) if issued_at is None else issued_at
    payload = f"{steam_id}.{issued}"
    return f"{payload}.{_signature(payload)}"


def read_session_token(token: str | None, now: int | None = None) -> str | None:
    """Devuelve el SteamID si el token es válido y no venció; si no, None."""
    session = read_session(token, now)
    return session[0] if session else None


def read_session(token: str | None, now: int | None = None) -> tuple[str, int] | None:
    """Devuelve (SteamID, emitido) si el token es válido y no venció; si no, None."""
    if not token or token.count(".") != 2:
        return None
    steam_id, issued, signature = token.split(".")
    if not (steam_id.isdigit() and len(steam_id) == 17 and issued.isdigit()):
        return None
    if not hmac.compare_digest(signature, _signature(f"{steam_id}.{issued}")):
        return None
    current = int(time.time()) if now is None else now
    if current - int(issued) > SESSION_MAX_AGE_SECONDS:
        return None
    return steam_id, int(issued)


def current_steam_id(request: Request, db: Session = Depends(get_db)) -> str | None:
    """Dependencia de FastAPI: SteamID de la sesión, o None si no hay sesión válida.

    Una sesión emitida antes de que el usuario borrara sus datos tampoco vale."""
    session = read_session(request.cookies.get(SESSION_COOKIE))
    if session is None:
        return None
    steam_id, issued = session
    from app.services.profile_service import sessions_valid_after  # evita la importación circular

    revoked_at = sessions_valid_after(db, steam_id)
    if revoked_at is not None and issued <= revoked_at:
        return None
    return steam_id


def is_moderator(steam_id: str | None) -> bool:
    return bool(steam_id) and steam_id in get_settings().admin_steam_id_set


def require_steam_id(steam_id: str | None = Depends(current_steam_id)) -> str:
    """Dependencia de FastAPI para endpoints que exigen haber iniciado sesión con Steam."""
    if steam_id is None:
        raise HTTPException(status_code=401, detail="Iniciá sesión con Steam para hacer esto.")
    return steam_id
