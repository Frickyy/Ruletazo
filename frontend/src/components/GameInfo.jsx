import { Critics, Verdict, formatPrice } from "./GameCard.jsx";
import GameStatePicker from "./GameStatePicker.jsx";
import DurationValue from "./DurationValue.jsx";
import { formatNumber, t } from "../i18n/index.js";
import "./GameCard.css";

/**
 * La información de la tarjeta de la ruleta, para el foro de cada juego: géneros, modos, sinopsis,
 * duración, reseñas de Steam, dificultad de logros, precio, crítica y "lo bueno / lo malo".
 * `game` es null mientras carga. `onSetState` (con sesión): cambiar o sacar tu estado en el juego.
 */
function GameInfo({ game, onSetState }) {
  if (!game) return <p className="hint game-info__loading">{t("Cargando la ficha del juego…")}</p>;
  const releaseYear = game.release_date ? game.release_date.slice(0, 4) : "";
  const meta = [game.developer, game.genres.map((genre) => t(genre)).join(", "), releaseYear].filter(Boolean).join(" · ");
  const modes = [
    game.single_player && t("Un jugador"),
    game.coop && t("Cooperativo"),
    game.multiplayer && !game.coop && t("Multijugador"),
    game.local_multiplayer && t("Pantalla compartida"),
  ].filter(Boolean);

  return (
    <section className="game-info" aria-label={t("Ficha del juego")}>
      <div className="game-info__main">
        {meta && <p className="game-card__meta">{meta}</p>}
        {modes.length > 0 && (
          <ul className="game-card__modes" aria-label={t("Modos de juego")}>
            {modes.map((mode) => (
              <li key={mode} className="tag">
                {mode}
              </li>
            ))}
          </ul>
        )}
        <p className="game-card__description">{game.short_description || t("Steam no tiene una sinopsis para este juego.")}</p>
        {onSetState && <GameStatePicker state={game.state} onChange={onSetState} />}
        {(game.review_good?.length > 0 || game.review_bad?.length > 0) && (
          <div className="game-card__verdict">
            <Verdict kind="good" title={t("Lo bueno")} excerpts={game.review_good} />
            <Verdict kind="bad" title={t("Lo malo")} excerpts={game.review_bad} />
            <p className="game-card__verdict-note">{t("Frases de las reseñas más votadas como útiles en Steam.")}</p>
          </div>
        )}
      </div>

      <div className="game-info__side">
        <dl className="game-card__stats">
          <div>
            <dt>{t("Duración")}</dt>
            <dd>
              <DurationValue game={game} />
            </dd>
          </div>
          <div>
            <dt>{t("Reseñas de Steam")}</dt>
            <dd>
              {game.review_score_desc ? t(game.review_score_desc) : t("Sin reseñas")}
              {game.review_total > 0 && <span className="mono muted"> · {formatNumber(game.review_total)}</span>}
            </dd>
          </div>
          <div>
            <dt>{t("Dificultad de logros")}</dt>
            <dd>{t(game.achievement_difficulty)}</dd>
          </div>
          {game.price_cents != null && (
            <div>
              <dt>{t("Precio")}</dt>
              <dd className="mono">{formatPrice(game.price_cents)}</dd>
            </div>
          )}
        </dl>
        <Critics scores={game.critics} />
      </div>
    </section>
  );
}

export default GameInfo;
