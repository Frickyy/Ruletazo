/**
 * Componente presentacional: recibe el juego elegido y lo muestra.
 * No sabe de dónde vienen los datos (eso es de `useRandomGame` y `gameService`).
 * `onToggleFavorite` es opcional: sin sesión no se muestra la estrella.
 */
function GameCard({ game, onToggleFavorite, achievementProgress, isLoadingAchievements, achievementError }) {
  const playtimeHours = Math.round(game.playtime_forever_minutes / 60);
  const featuredReview = game.featured_reviews.find(isReadableReview);
  const releaseYear = game.release_date ? game.release_date.slice(0, 4) : "";
  const meta = [game.developer, game.genres.join(", "), releaseYear].filter(Boolean).join(" · ");
  const showAchievements = isLoadingAchievements || achievementError || achievementProgress?.total > 0;
  const achievementPercent = achievementProgress?.total
    ? Math.round((achievementProgress.unlocked / achievementProgress.total) * 100)
    : 0;

  return (
    <article className="game-card" aria-labelledby="game-card-title">
      <div className="game-card__main">
        <div className="game-card__cover">
          <img src={game.header_image} alt={`Portada de ${game.name}`} />
          {onToggleFavorite && (
            <button
              type="button"
              className="favorite-button"
              onClick={() => onToggleFavorite(game)}
              aria-pressed={game.is_favorite}
              aria-label={game.is_favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
            >
              {game.is_favorite ? "★" : "☆"}
            </button>
          )}
        </div>

        <div className="game-card__info">
          <p className="eyebrow">
            Te tocó
            {game.source === "friend" && <span className="game-card__source"> · de tu familia</span>}
            {game.source === "both" && <span className="game-card__source"> · en ambas bibliotecas</span>}
          </p>
          <h2 id="game-card-title">{game.name}</h2>
          {meta && <p className="game-card__meta">{meta}</p>}
          <p className="game-card__description">
            {game.short_description || "Steam no tiene una sinopsis para este juego."}
          </p>
          <a className="game-card__steam-link" href={`https://store.steampowered.com/app/${game.appid}/`} target="_blank" rel="noopener noreferrer">
            Ver en Steam →
          </a>
        </div>
      </div>

      <div className="game-card__side">
        <dl className="game-card__stats">
          <div>
            <dt>Historia principal (HLTB)</dt>
            <dd className="mono">{formatHours(game.hltb_main_hours)}</dd>
          </div>
          <div>
            <dt>Completista (HLTB)</dt>
            <dd className="mono">{formatHours(game.hltb_completionist_hours)}</dd>
          </div>
          <div>
            <dt>Reseñas</dt>
            <dd>
              {game.review_score_desc || "Sin reseñas"}
              {game.review_total > 0 && <span className="mono muted"> · {game.review_total.toLocaleString("es-AR")}</span>}
            </dd>
          </div>
          <div>
            <dt>Dificultad de logros</dt>
            <dd>{game.achievement_difficulty}</dd>
          </div>
          {game.price_cents != null && (
            <div>
              <dt>Precio</dt>
              <dd className="mono">{formatPrice(game.price_cents)}</dd>
            </div>
          )}
          <div>
            <dt>Tu tiempo de juego</dt>
            <dd className="mono">{playtimeHours} h</dd>
          </div>
        </dl>
        {featuredReview && <blockquote className="game-card__review">“{featuredReview}”</blockquote>}
      </div>

      {showAchievements && (
        <section className="game-achievements" aria-label="Logros">
          <div className="game-achievements__heading">
            <h3>Logros</h3>
            <span className="mono">
              {isLoadingAchievements
                ? "Cargando…"
                : achievementError
                  ? "No disponible"
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
                      <strong>{achievement.name || "Logro sin nombre"}</strong>
                      <p>{achievement.description || "Sin descripción."}</p>
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

/** HowLongToBeat devuelve decimales (ej. 21.88): se muestran redondeados. */
function formatHours(hours) {
  if (hours == null) return "—";
  if (hours < 1) return "< 1 h";
  return `${Math.round(hours)} h`;
}

function formatPrice(priceCents) {
  if (priceCents === 0) return "Gratis";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD" }).format(priceCents / 100);
}

/**
 * Descarta reseñas que son solo arte con símbolos o emojis (pasa seguido en Steam):
 * al menos la mitad de los caracteres visibles tienen que ser letras.
 */
function isReadableReview(review) {
  const visible = review.replace(/\s/g, "");
  if (visible.length < 15) return false;
  const letters = visible.match(/\p{L}/gu)?.length ?? 0;
  return letters / visible.length >= 0.5;
}

export default GameCard;
