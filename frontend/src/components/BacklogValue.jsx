import { useEffect, useMemo, useState } from "react";
import { formatNumber, t } from "../i18n/index.js";
import { shareBacklog } from "../services/backlogCard.js";
import { backlogStats, formatMoney } from "../services/backlogStats.js";
import { track } from "../services/track.js";
import "./BacklogValue.css";

/**
 * "Tu pila sin jugar": cuántos juegos sin estrenar tenés, cuánto valen hoy en la tienda y un
 * botón para compartirlo como imagen. No se muestra si no hay ninguno sin estrenar.
 */
function BacklogValue({ games }) {
  const stats = useMemo(() => backlogStats(games), [games]);
  const [status, setStatus] = useState(null); // null | "working" | "copied"
  useEffect(() => setStatus(null), [stats.unplayed]);

  if (stats.unplayed === 0) return null;

  async function handleShare() {
    track("backlog_share");
    setStatus("working");
    try {
      const result = await shareBacklog(stats);
      setStatus(result === "copied" ? "copied" : null);
      if (result === "copied") setTimeout(() => setStatus(null), 2500);
    } catch {
      setStatus(null);
    }
  }

  return (
    <section className="backlog-value" aria-labelledby="backlog-value-title">
      <div className="backlog-value__text">
        <h2 id="backlog-value-title">{t("Tu pila sin jugar")}</h2>
        <p className="backlog-value__numbers">
          <strong>{formatNumber(stats.unplayed)}</strong> {t("juegos sin estrenar")}
          {stats.valueCents > 0 && (
            <>
              {" · "}
              <strong>{formatMoney(stats.valueCents)}</strong> {t("a precio de hoy en Steam")}
            </>
          )}
        </p>
        {stats.priced < stats.unplayed && (
          <p className="hint">
            {t("El valor cuenta {priced} de {unplayed}: al resto todavía no le cargamos el precio o ya no se vende.", {
              priced: formatNumber(stats.priced),
              unplayed: formatNumber(stats.unplayed),
            })}
          </p>
        )}
      </div>
      <button type="button" className="button button--primary" onClick={handleShare} disabled={status === "working"}>
        {status === "copied" ? `✓ ${t("Link copiado")}` : status === "working" ? t("Armando la imagen…") : t("Compartir mi pila")}
      </button>
    </section>
  );
}

export default BacklogValue;
