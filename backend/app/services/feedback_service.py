"""Formulario de feedback: guarda el comentario y lo manda por mail a FEEDBACK_EMAIL.

FEEDBACK_EMAIL acepta varias direcciones separadas por comas (p. ej. la casilla de la página y
una personal para enterarse al toque); a todas les llega el mismo mail.

El mail sale por la API de Resend si hay RESEND_API_KEY (va por HTTPS, así que anda aunque el
servidor bloquee los puertos de mail), o si no por SMTP (Gmail con una contraseña de aplicación,
ver DESARROLLO.md). Si nada está configurado o falla, el comentario igual queda guardado en la
tabla `feedback` con `emailed = False`, así no se pierde ninguno.

Quién lo mandó se sabe por la sesión de Steam: el asunto es "<nombre> mandó un feedback" y el
nombre va con link a su perfil. Sin sesión, el comentario llega como anónimo.
"""

import logging
import smtplib
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from html import escape

import httpx
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.game import Feedback

logger = logging.getLogger(__name__)

KINDS = {"idea": "Idea", "bug": "Algo no anda", "other": "Otra cosa"}
ANONYMOUS = "Alguien sin sesión"
MAX_MESSAGE = 2000
MAX_NAME = 100
MAX_PAGE = 200


def save_feedback(
    db: Session, *, kind: str, message: str, steam_id: str | None, steam_name: str | None, page: str | None
) -> Feedback:
    feedback = Feedback(
        kind=kind if kind in KINDS else "other",
        message=message.strip()[:MAX_MESSAGE],
        steam_id=steam_id,
        steam_name=_one_line(steam_name)[:MAX_NAME] or None if steam_id else None,
        page=(page or "").strip()[:MAX_PAGE] or None,
        emailed=False,
    )
    db.add(feedback)
    db.commit()
    db.refresh(feedback)
    return feedback


def profile_url(steam_id: str) -> str:
    return f"https://steamcommunity.com/profiles/{steam_id}"


def sender_name(feedback: Feedback) -> str:
    if not feedback.steam_id:
        return ANONYMOUS
    return feedback.steam_name or "Jugador de Steam"


def recipients(value: str) -> str:
    """Normaliza la lista: "a@x.com,  b@y.com" -> "a@x.com, b@y.com" (sin vacíos ni repetidos)."""
    seen: list[str] = []
    for address in value.split(","):
        address = address.strip()
        if address and address.lower() not in (a.lower() for a in seen):
            seen.append(address)
    return ", ".join(seen)


def build_email(feedback: Feedback, sender: str, recipient: str) -> EmailMessage:
    name = sender_name(feedback)
    kind = KINDS.get(feedback.kind, "Otra cosa")
    date = f"{feedback.created_at:%Y-%m-%d %H:%M} UTC" if feedback.created_at else ""

    email = EmailMessage()
    email["Subject"] = f"{name} mandó un feedback"
    email["From"] = sender
    email["To"] = recipients(recipient)
    email["Date"] = formatdate(localtime=True)
    email["Message-ID"] = make_msgid(domain="ruletazo")

    who = f"{name} ({profile_url(feedback.steam_id)})" if feedback.steam_id else name
    text = "\n".join(
        [
            f"De: {who}",
            f"Tipo: {kind}",
            f"Página: {feedback.page or '(desconocida)'}",
            f"Fecha: {date}",
            "",
            feedback.message,
        ]
    )
    email.set_content(text)

    # Versión HTML: el nombre de Steam es un link al perfil.
    who_html = (
        f'<a href="{escape(profile_url(feedback.steam_id))}">{escape(name)}</a>' if feedback.steam_id else escape(name)
    )
    message_html = escape(feedback.message).replace("\n", "<br>")
    html = (
        '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1a1917">'
        f"<p style=\"margin:0 0 4px\"><strong>{who_html}</strong> mandó un feedback.</p>"
        f'<p style="margin:0 0 16px;color:#6b655e;font-size:13px">{escape(kind)} · {escape(feedback.page or "")} · {escape(date)}</p>'
        f'<div style="padding:12px 14px;border-left:3px solid #ff5c9a;background:#f7f4f1">{message_html}</div>'
        "</div>"
    )
    email.add_alternative(html, subtype="html")
    return email


def send_feedback_email(db: Session, feedback_id: int) -> bool:
    """Manda el mail de un comentario ya guardado. Pensado para correr en segundo plano."""
    settings = get_settings()
    feedback = db.get(Feedback, feedback_id)
    if feedback is None or feedback.emailed:
        return False
    if settings.resend_configured:
        email = build_email(feedback, settings.email_from, settings.feedback_email)
        try:
            _send_with_resend(email, settings.resend_api_key)
        except httpx.HTTPError:
            logger.exception("No se pudo mandar el mail del feedback %s por Resend (queda guardado).", feedback_id)
            return False
    elif settings.smtp_configured:
        email = build_email(feedback, settings.smtp_user, settings.feedback_email)
        try:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
                smtp.starttls()
                smtp.login(settings.smtp_user, settings.smtp_password)
                smtp.send_message(email)
        except (smtplib.SMTPException, OSError):
            logger.exception("No se pudo mandar el mail del feedback %s (queda guardado).", feedback_id)
            return False
    else:
        logger.warning("Feedback %s guardado sin mandar: falta RESEND_API_KEY o SMTP_USER / SMTP_PASSWORD.", feedback_id)
        return False
    feedback.emailed = True
    db.commit()
    return True


RESEND_URL = "https://api.resend.com/emails"


def _send_with_resend(email: EmailMessage, api_key: str) -> None:
    """Manda el mismo mail que armó build_email, pero por la API HTTPS de Resend."""
    payload = {
        "from": email["From"],
        "to": [address.strip() for address in email["To"].split(",") if address.strip()],
        "subject": email["Subject"],
        "text": email.get_body(("plain",)).get_content(),
        "html": email.get_body(("html",)).get_content(),
    }
    response = httpx.post(RESEND_URL, json=payload, headers={"Authorization": f"Bearer {api_key}"}, timeout=20)
    response.raise_for_status()


def _one_line(value: str | None) -> str:
    """Los nombres de Steam pueden traer saltos de línea: en un asunto de mail no van."""
    return " ".join((value or "").split())
