import { useMemo } from "react";
import SteamLoginButton from "./SteamLoginButton.jsx";
import "./IdlePanel.css";

const UNPLAYED_COUNT = 6;
const TOP_PLAYED_COUNT = 5;

/**
 * Lo que se ve debajo de la ruleta antes del primer giro, para que la página no quede vacía.
 * Con sesión: algunos juegos sin estrenar (se pueden elegir a mano) y los más jugados.
 * Sin sesión: cómo funciona y una invitación a iniciar sesión.
 */
function IdlePanel({ steamId, library, pool, onPick, onLogin, isStale = false }) {
  // isStale: ya se giró y se está esperando la ficha; el panel se atenúa en vez de desaparecer.
  return (
    <div className={`idle-panel-wrap${isStale ? " idle-panel-wrap--stale" : ""}`} inert={isStale ? "" : undefined}>
      {steamId ? <LibraryPanel library={library} pool={pool} onPick={onPick} /> : <DemoPanel onLogin={onLogin} />}
    </div>
  );
}

function LibraryPanel({ library, pool, onPick }) {
  // Se eligen una vez por biblioteca/filtros, no en cada render.
  const unplayed = useMemo(() => {
    const poolIds = new Set(pool.map((game) => game.appid));
    const candidates = library.filter((game) => game.playtime_forever_minutes === 0 && poolIds.has(game.appid));
    return shuffle(candidates).slice(0, UNPLAYED_COUNT);
  }, [library, pool]);

  const topPlayed = useMemo(
    () =>
      library
        .filter((game) => game.source !== "friend" && game.playtime_forever_minutes > 0)
        .sort((a, b) => b.playtime_forever_minutes - a.playtime_forever_minutes)
        .slice(0, TOP_PLAYED_COUNT),
    [library],
  );
  const maxMinutes = topPlayed[0]?.playtime_forever_minutes ?? 1;

  if (unplayed.length === 0 && topPlayed.length === 0) return null;

  return (
    <div className="idle-panel">
      {unplayed.length > 0 && (
        <section className="idle-panel__block" aria-labelledby="idle-unplayed">
          <div className="idle-panel__heading">
            <h2 id="idle-unplayed">Esperando su turno</h2>
            <p className="hint">Juegos sin estrenar que entran en la ruleta. Si alguno te tienta, elegilo directo.</p>
          </div>
          <ul className="idle-covers">
            {unplayed.map((game) => (
              <li key={game.appid}>
                <button type="button" className="idle-cover" onClick={() => onPick(game)}>
                  <img src={game.header_image} alt="" loading="lazy" />
                  <span className="idle-cover__name">{game.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {topPlayed.length > 0 && (
        <section className="idle-panel__block idle-panel__block--side" aria-labelledby="idle-top">
          <div className="idle-panel__heading">
            <h2 id="idle-top">Lo que más jugaste</h2>
          </div>
          <ol className="idle-top">
            {topPlayed.map((game) => (
              <li key={game.appid}>
                <span className="idle-top__name">{game.name}</span>
                <span className="idle-top__hours mono">{formatHours(game.playtime_forever_minutes)}</span>
                <span className="idle-top__bar" aria-hidden="true">
                  <span style={{ width: `${(game.playtime_forever_minutes / maxMinutes) * 100}%` }} />
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function DemoPanel({ onLogin }) {
  const steps = [
    ["Iniciá sesión con Steam", "Sin contraseñas: Steam confirma quién sos y la ruleta carga tu biblioteca."],
    ["Filtrá lo que quieras", "Sin estrenar, poco jugados, favoritos, por género o sumando la biblioteca de tu familia."],
    ["Girá y decidí", "Te mostramos cuánto dura, qué opina la comunidad y cuántos logros te faltan."],
  ];
  return (
    <div className="idle-panel">
      <section className="idle-panel__block" aria-labelledby="idle-how">
        <div className="idle-panel__heading">
          <h2 id="idle-how">Cómo funciona</h2>
        </div>
        <ol className="idle-steps">
          {steps.map(([title, text], index) => (
            <li key={title}>
              <span className="idle-steps__number mono">{String(index + 1).padStart(2, "0")}</span>
              <strong>{title}</strong>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className="idle-panel__block idle-panel__block--side idle-cta" aria-labelledby="idle-cta">
        <h2 id="idle-cta">Usá tu propia biblioteca</h2>
        <p className="hint">Ahora estás girando con 5 juegos de ejemplo. Con tu cuenta entran todos los tuyos.</p>
        {onLogin && <SteamLoginButton onClick={onLogin} />}
      </section>
    </div>
  );
}

function formatHours(minutes) {
  const hours = minutes / 60;
  if (hours < 1) return `${minutes} min`;
  return `${Math.round(hours).toLocaleString("es-AR")} h`;
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default IdlePanel;
