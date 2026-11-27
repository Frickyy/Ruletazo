import { STATE_LABELS } from "../services/libraryFilters.js";
import { t } from "../i18n/index.js";

/**
 * Jugando / Terminado / Abandonado. Tocar el estado activo lo saca (vuelve a "sin estado").
 * `compact`: un desplegable, para las filas de la Biblioteca.
 */
function GameStatePicker({ state, onChange, compact = false, name = "", disabled = false }) {
  if (compact) {
    return (
      <select
        className="game-state-select"
        value={state ?? ""}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value || null)}
        aria-label={name ? t("Estado de {name}", { name }) : t("Estado del juego")}
      >
        <option value="">{t("Sin estado")}</option>
        {Object.entries(STATE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {t(label)}
          </option>
        ))}
      </select>
    );
  }
  return (
    <div className="segmented game-card__state" role="group" aria-label={t("Estado del juego")}>
      {Object.entries(STATE_LABELS).map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={state === value}
          disabled={disabled}
          onClick={() => onChange(state === value ? null : value)}
          title={state === value ? t("Tocá de nuevo para sacarlo") : undefined}
        >
          {t(label)}
        </button>
      ))}
    </div>
  );
}

export default GameStatePicker;
