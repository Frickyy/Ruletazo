import { formatNumber, t } from "../i18n/index.js";
import "./ClassificationBanner.css";

/**
 * Progreso de la clasificación en segundo plano, bien visible la primera vez: explica por qué
 * los filtros de género, modo o logros se van llenando de a poco.
 * Pasada 1 (rápida): datos de la tienda. Pasada 2 (lenta): tu progreso de logros.
 */
function ClassificationBanner({ classification, onPause }) {
  if (!classification || classification.total === 0) return null;
  const { phase, classified, total, enriched, running, paused } = classification;
  if (phase === "done" || (!running && !paused && classified >= total && enriched >= total)) return null;

  const storePending = classified < total;
  const step = storePending ? 1 : 2;
  const done = storePending ? classified : Math.min(enriched, total);
  const percent = Math.round((done / total) * 100);

  return (
    <section className="classification" aria-live="polite" aria-label={t("Completando datos de la biblioteca")}>
      <div className="classification__text">
        <p className="classification__title">
          {storePending ? t("Leyendo tu biblioteca en la tienda de Steam") : t("Buscando tu progreso de logros")}
          <span className="classification__step mono">{t("paso {step} de 2", { step })}</span>
        </p>
        <p className="classification__detail">
          {storePending
            ? t("Géneros, modos de juego (cooperativo, multijugador), portadas y precios. Tarda unos segundos.")
            : t("Tu progreso de logros, de a un juego para no saturar a Steam. Podés seguir usando la ruleta: el filtro “Casi al 100%” se va completando.")}
          {paused && ` ${t("En pausa.")}`}
          {!paused && !running && ` ${t("Se cortó la conexión con Steam; se retoma la próxima vez que abras la app.")}`}
        </p>
      </div>
      <div className="classification__progress">
        <div className="classification__bar" aria-hidden="true">
          <span style={{ width: `${percent}%` }} />
        </div>
        <span className="mono classification__count">
          {formatNumber(done)}/{formatNumber(total)}
        </span>
        {onPause && (running || paused) && (
          <button type="button" className="text-button" onClick={() => onPause(!paused)}>
            {paused ? t("Reanudar") : t("Pausar")}
          </button>
        )}
      </div>
    </section>
  );
}

export default ClassificationBanner;
