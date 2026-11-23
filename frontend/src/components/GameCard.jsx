import { useEffect, useState } from "react";
import { STATE_LABELS } from "../services/libraryFilters.js";
import { shareResult } from "../services/shareResult.js";
import { formatNumber, locale, t } from "../i18n/index.js";

/**
 * Componente presentacional: recibe el juego elegido y lo muestra.
 * No sabe de dónde vienen los datos (eso es de `RoulettePage` y `gameService`).
 * `onToggleFavorite` es opcional: sin sesión no se muestra la estrella.
 * `isDemo`: juego de la biblioteca de ejemplo (sin sesión); no se muestran horas jugadas.
 * `onSpinAgain` ("Otro") y `onHide` ("No me lo muestres más") son opcionales.
 */
function GameCard({ game, isStale = false, isDemo = false, onToggleFavorite, onSpinAgain, onHide, onSetState, onOpenForum, achievementProgress, isLoadingAchievements, achievementError }) {
  const playtimeHours = Math.round(game.playtime_forever_minutes / 60);
  // Solo se puede lanzar si es tuyo (un juego de un familiar se juega desde su cuenta compartida).
  const canPlay = !isDemo && game.source !== "friend";
  const modes = [
    game.single_player && t("Un jugador"),
    game.coop && t("Cooperativo"),
    game.multiplayer && !game.coop && t("Multijugador"),
    game.local_multiplayer && t("Pantalla compartida"),
  ].filter(Boolean);
  const releaseYear = game.release_date ? game.release_date.slice(0, 4) : "";
  const meta = [game.developer, game.genres.map((genre) => t(genre)).join(", "), releaseYear].filter(Boolean).join(" · ");
  const showAchievements = isLoadingAchievements || achievementError || achievementProgress?.total > 0;
  const achievementPercent = achievementProgress?.total
    ? Math.round((achievementProgress.unlocked / achievementProgress.total) * 100)
    : 0;
  // "Compartir": manda "Me tocó X en Ruletazo" con el link de la página (bucle para traer gente).
  const [shareStatus, setShareStatus] = useState(null);
  useEffect(() => setShareStatus(null), [game.appid]);
  async function handleShare() {
    try {
      const result = await shareResult(game.name);
      if (result === "copied") {
        setShareStatus("copied");
        setTimeout(() => setShareStatus(null), 2500);
      }
    } catch {
      setShareStatus(null);
    }
  }

  return (
    // isStale: es la ficha del giro anterior mientras sale el próximo; se atenúa y no se puede tocar.
    <article className={`game-card${isStale ? " game-card--stale" : ""}`} aria-labelledby="game-card-title" aria-busy={isStale} inert={isStale ? "" : undefined}>
      <div className="game-card__main">
        <div className="game-card__cover">
          <img src={game.header_image} alt={t("Portada de {name}", { name: game.name })} />
          {onToggleFavorite && (
            <button
              type="button"
              className="favorite-button"
              onClick={() => onToggleFavorite(game)}
              aria-pressed={game.is_favorite}
              aria-label={game.is_favorite ? t("Quitar de favoritos") : t("Agregar a favoritos")}
            >
              {game.is_favorite ? "★" : "☆"}
            </button>
          )}
        </div>

        <div className="game-card__info">
          <p className="eyebrow">
            {t("Te tocó")}
            {isDemo && <span className="game-card__source"> · {t("biblioteca de ejemplo")}</span>}
            {game.source === "friend" && <span className="game-card__source"> · {t("de tu familia")}</span>}
            {game.source === "both" && <span className="game-card__source"> · {t("en ambas bibliotecas")}</span>}
          </p>
          <h2 id="game-card-title">{game.name}</h2>
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
          <p className="game-card__description">
            {game.short_description || t("Steam no tiene una sinopsis para este juego.")}
          </p>
          <div className="game-card__links">
            {canPlay && (
              // Abre el cliente de Steam y lanza el juego (lo instala primero si hace falta).
              <a className="button button--primary" href={`steam://run/${game.appid}`}>
                ▶ {t("Jugar ahora")}
              </a>
            )}
            {onSpinAgain && (
              <button type="button" className={`button${canPlay ? "" : " button--primary"}`} onClick={onSpinAgain} title={t("Gira de nuevo y este juego no vuelve a salir por hoy")}>
                ↻ {t("Otro")}
              </button>
            )}
            {onOpenForum && (
              <button type="button" className="button" onClick={() => onOpenForum({ appid: game.appid, name: game.name })}>
                {t("Foro del juego")}
              </button>
            )}
            <a className="button" href={`https://store.steampowered.com/app/${game.appid}/`} target="_blank" rel="noopener noreferrer">
              {t("Ver en Steam")} ↗
            </a>
            <button type="button" className="button" onClick={handleShare}>
              {shareStatus === "copied" ? `✓ ${t("Link copiado")}` : t("Compartir")}
            </button>
          </div>
          {onSetState && game.source !== "friend" && (
            <div className="segmented game-card__state" role="group" aria-label={t("Estado del juego")}>
              {Object.entries(STATE_LABELS).map(([state, label]) => (
                <button
                  key={state}
                  type="button"
                  aria-pressed={game.state === state}
                  // Tocar el estado activo lo quita.
                  onClick={() => onSetState(game, game.state === state ? null : state)}
                >
                  {t(label)}
                </button>
              ))}
            </div>
          )}
          {onHide && (
            <button type="button" className="text-button game-card__hide" onClick={() => onHide(game)}>
              {t("No me lo muestres más")}
            </button>
          )}
        </div>
      </div>

      <div className="game-card__side">
        <dl className="game-card__stats">
          <div>
            <dt>{game.duration_source === "hltb" ? t("Historia principal (HLTB)") : t("Duración")}</dt>
            <dd>
              <span className="mono">{formatHours(game.duration_hours)}</span>
              {game.duration_source === "community" && (
                <span className="muted game-card__source" title={t("Mediana de las horas en Steam de quienes lo marcaron como terminado en Ruletazo")}>
                  {" "}· {t("según {n} jugadores", { n: game.duration_samples })}
                </span>
              )}
            </dd>
          </div>
          {game.hltb_completionist_hours != null && (
            <div>
              <dt>{t("Completista (HLTB)")}</dt>
              <dd className="mono">{formatHours(game.hltb_completionist_hours)}</dd>
            </div>
          )}
          <div>
            <dt>{t("Reseñas")}</dt>
            <dd>
              {game.review_score_desc ? t(game.review_score_desc) : t("Sin reseñas")}
              {game.review_total > 0 && <span className="mono muted"> · {formatNumber(game.review_total)}</span>}
            </dd>
          </div>
          <div>
            <dt>{t("Reseñas en Ruletazo")}</dt>
            <dd>
              {game.community_review_count > 0 ? (
                <>
                  <span className="mono">{formatNumber(game.community_average_score)}/10</span>
                  <span className="mono muted"> · {formatNumber(game.community_review_count)}</span>
                </>
              ) : onOpenForum ? (
                <button type="button" className="text-button" onClick={() => onOpenForum({ appid: game.appid, name: game.name, tab: "reviews" })}>
                  {t("Escribí la primera")}
                </button>
              ) : (
                t("Sin reseñas")
              )}
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
          {!isDemo && (
            <div>
              <dt>{game.source === "friend" ? t("Horas de tu familiar") : t("Tu tiempo de juego")}</dt>
              <dd className="mono">{playtimeHours} h</dd>
            </div>
          )}
        </dl>
        {(game.review_good?.length > 0 || game.review_bad?.length > 0) && (
          <div className="game-card__verdict">
            <Verdict kind="good" title={t("Lo bueno")} excerpts={game.review_good} />
            <Verdict kind="bad" title={t("Lo malo")} excerpts={game.review_bad} />
            <p className="game-card__verdict-note">{t("Frases de las reseñas más votadas como útiles en Steam.")}</p>
          </div>
        )}
      </div>

      {showAchievements && (
        <section className="game-achievements" aria-label={t("Logros")}>
          <div className="game-achievements__heading">
            <h3>{t("Logros")}</h3>
            <span className="mono">
              {isLoadingAchievements
                ? t("Cargando…")
                : achievementError
                  ? t("No disponible")
                  : `${achievementProgress.unlocked}/${achievementProgress.total} · ${achievementPercent}%`}
            </span>
          </div>
          {achievementProgress?.total > 0 && (
            <div className="game-achievements__bar" aria-hidden="true">
              <span style={{ width: `${achievementPercent}%` }} />
            </div>
          )}
          {achievementProgress?.achievements?.length > 0 && (
            <div className="game-achievements__list">
              {achievementProgress.achievements.map((achievement, index) => {
                const icon = achievement.achieved ? achievement.icon : achievement.icon_gray || achievement.icon;
                return (
                  <article className={`achievement${achievement.achieved ? " achievement--unlocked" : ""}`} key={`${achievement.name}-${index}`}>
                    {icon && <img src={icon} alt="" />}
                    <div>
                      <strong>{achievement.name || t("Logro sin nombre")}</strong>
                      <p>{achievement.description || t("Sin descripción.")}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </article>
  );
}

function Verdict({ kind, title, excerpts = [] }) {
  if (excerpts.length === 0) return null;
  return (
    <section className={`verdict verdict--${kind}`} aria-label={title}>
      <h3 className="verdict__title">{title}</h3>
      <ul>
        {excerpts.map((excerpt) => (
          <li key={excerpt}>
            <q>{excerpt}</q>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** HowLongToBeat devuelve decimales (ej. 21.88): se muestran redondeados. */
function formatHours(hours) {
  if (hours == null) return "—";
  if (hours < 1) return "< 1 h";
  return `${Math.round(hours)} h`;
}

function formatPrice(priceCents) {
  if (priceCents === 0) return t("Gratis");
  return new Intl.NumberFormat(locale(), { style: "currency", currency: "USD" }).format(priceCents / 100);
}

export default GameCard;
