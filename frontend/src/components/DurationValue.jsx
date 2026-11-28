import { formatHours } from "./GameCard.jsx";
import { t } from "../i18n/index.js";

/** Lo que va en "Duración": la historia con algunos extras y, si IGDB lo tiene, el completista (100 %). */
function DurationValue({ game, emptyTitle }) {
  return (
    <>
      {game.duration_hours == null ? (
        <span className="muted" title={emptyTitle}>
          {t("Sin datos todavía")}
        </span>
      ) : (
        <span className="mono">{formatHours(game.duration_hours)}</span>
      )}
      {game.duration_source === "community" && (
        <span className="muted game-card__source" title={t("Mediana de las horas en Steam de quienes lo marcaron como terminado en Ruletazo")}>
          {" "}· {t("según {n} jugadores", { n: game.duration_samples })}
        </span>
      )}
      {game.duration_source === "igdb" && (
        <span className="muted game-card__source">
          {" "}·{" "}
          <a
            href={game.duration_url || "https://www.igdb.com/"}
            target="_blank"
            rel="noopener noreferrer"
            title={t("Promedio de lo que cargaron {n} personas en IGDB: la historia y algunos extras", { n: game.duration_samples })}
          >
            {t("según IGDB")}
          </a>
        </span>
      )}
      {game.duration_full_hours != null && (
        <span className="game-card__full" title={t("Para sacar todos los logros (el 100 %), según IGDB")}>
          {t("Completista")}: <span className="mono">{formatHours(game.duration_full_hours)}</span>
        </span>
      )}
    </>
  );
}

export default DurationValue;
