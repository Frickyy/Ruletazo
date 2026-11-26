"""Estadísticas de uso anónimas: cuántas veces por día pasa cada paso de la página.

Sirven para saber dónde se pierde la gente (entra, prueba el demo, pega su perfil, la
biblioteca carga o es privada, gira, inicia sesión) sin guardar quién hizo qué: cada evento
solo suma 1 al contador de ese día.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session

from app.models.game import UsageCounter

# Los únicos eventos que se cuentan (el frontend los manda desde services/track.js).
EVENTS = frozenset(
    {
        "visit",  # abrió la página (una vez por pestaña)
        "demo_spin",  # giró la ruleta de ejemplo
        "guest_submit",  # pegó el link de un perfil
        "library_ok",  # una biblioteca cargó bien
        "library_private",  # la biblioteca era privada en Steam
        "library_error",  # otro error al cargar la biblioteca
        "spin",  # giró con una biblioteca real
        "login_click",  # tocó "Iniciar sesión con Steam"
        "login_success",  # volvió de Steam con la sesión iniciada
        "share",  # compartió lo que le tocó
        "backlog_share",  # compartió su pila sin jugar
        "room_create",  # armó una sala grupal
        "streamer_overlay",  # abrió la ruleta del modo streamer (la fuente de OBS)
    }
)

# Argentina no tiene horario de verano: UTC-3 todo el año. El día cambia a medianoche de acá,
# no a las 21:00 como pasaría con la hora UTC del servidor.
ARGENTINA = timezone(timedelta(hours=-3))


def today() -> str:
    return datetime.now(ARGENTINA).date().isoformat()


def record(db: Session, event: str, day: str | None = None) -> None:
    """Suma 1 al contador de `event` en `day` (hoy por defecto). En un solo UPDATE para que dos
    eventos al mismo tiempo no se pisen."""
    if event not in EVENTS:
        raise ValueError(f"Evento desconocido: {event}")
    stmt = insert(UsageCounter).values(day=day or today(), event=event, count=1)
    db.execute(stmt.on_conflict_do_update(index_elements=["day", "event"], set_={"count": UsageCounter.count + 1}))
    db.commit()
