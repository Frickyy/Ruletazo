import { useEffect, useState } from "react";
import { fetchDailyGame } from "../services/gameService.js";
import { formatNumber, t } from "../i18n/index.js";
import "./DailyGame.css";

/**
 * "Juego del día": el mismo juego para toda la comunidad, cambia cada día. Si está en tu biblioteca
 * (o en la de ejemplo) se puede abrir su ficha; si no, va a la tienda. Da un motivo para volver.
 * `games`: los juegos que se pueden abrir con `onPick` (tu biblioteca, o la de ejemplo sin sesión).
 * `isDemo`: sin sesión no es "tu" juego, así que el botón dice solo "Ver ficha".
 */
function DailyGame({ games, onPick, isDemo = false }) {
  const [daily, setDaily] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchDailyGame()
      .then((data) => !cancelled && setDaily(data))
      .catch(() => {}); // si falla no se muestra nada: es un extra
    return () => {
      cancelled = true;
    };
  }, []);

  if (!daily) return null;
  const owned = games.find((game) => game.appid === daily.appid);
  const owners = daily.owners === 1
    ? t("1 jugador de Ruletazo lo tiene")
    : t("{count} jugadores de Ruletazo lo tienen", { count: formatNumber(daily.owners) });

  return (
    <section className="daily-game" aria-label={t("Juego del día")}>
      <img className="daily-game__cover" src={daily.header_image} alt="" loading="lazy" />
      <div className="daily-game__info">
        <p className="eyebrow">{t("Juego del día")}</p>
        <h3 className="daily-game__name">{daily.name}</h3>
        <p className="daily-game__meta">{daily.owners > 0 ? owners : t("El mismo para toda la comunidad, cambia cada día.")}</p>
      </div>
      {owned ? (
        <button type="button" className="button button--primary daily-game__action" onClick={() => onPick(owned)}>
          {isDemo ? t("Ver ficha") : t("¡Lo tenés! Ver ficha")}
        </button>
      ) : (
        <a className="button daily-game__action" href={`https://store.steampowered.com/app/${daily.appid}/`} target="_blank" rel="noopener noreferrer">
          {t("Ver en Steam")} ↗
        </a>
      )}
    </section>
  );
}

export default DailyGame;
