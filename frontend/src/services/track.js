/**
 * Estadísticas de uso anónimas: avisa al backend que pasó un paso (giró, pegó un perfil…) y él
 * suma 1 al contador del día. No se manda nada que identifique a la persona.
 * Los eventos válidos son los de backend/app/services/usage_service.py (EVENTS).
 */

const EVENTS_URL = `${import.meta.env.VITE_API_URL ?? "/api"}/events`;

/** Nunca frena ni rompe la página: si falla, el evento se pierde y listo. */
export function track(event) {
  try {
    // keepalive: el aviso sale aunque la página se esté yendo (por ejemplo, al ir al login de Steam).
    fetch(EVENTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event }),
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {});
  } catch {
    /* sin fetch: no se cuenta */
  }
}

/** Una sola vez por pestaña (por ejemplo, la visita), aunque la página se vuelva a dibujar. */
export function trackOnce(event) {
  try {
    const key = `ruletazo.tracked.${event}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    /* almacenamiento bloqueado: se cuenta igual */
  }
  track(event);
}
