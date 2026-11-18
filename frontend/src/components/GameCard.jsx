/**
 * Componente "tonto" (presentacional): recibe datos por props y solo los muestra.
 * No sabe de dónde vienen los datos ni cómo se piden — esa responsabilidad
 * es del hook `useRandomGame` y del `gameService`. `onToggleFavorite` es opcional:
 * si no se pasa, no se muestra la estrella (ej. mientras no hay SteamID cargado).
 */
function GameCard({ game, onToggleFavorite, achievementProgress, isLoadingAchievements, achievementError }) {
  const playtimeHours = Math.round(game.playtime_forever_minutes / 60);
  const featuredReview = game.featured_reviews.find(isReadableReview);

  return (
    <article className="game-card">
      <div className="game-card__image-wrap">
        <img className="game-card__image" src={game.header_image} alt={`Portada de ${game.name}`} />
        {onToggleFavorite && (
          <button
            type="button"
            className={`game-card__favorite${game.is_favorite ? " game-card__favorite--active" : ""}`}
            onClick={() => onToggleFavorite(game)}
            title={game.is_favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
            aria-label={game.is_favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
          >
            {game.is_favorite ? "★" : "☆"}
          </button>
        )}
      </div>
      <div className="game-card__body">
        <h2>
          {game.name}
          {game.source === "friend" && <span className="game-card__source"> de tu familia</span>}
          {game.source === "both" && <span className="game-card__source"> en ambas bibliotecas</span>}
        </h2>

        {game.developer && <p className="game-card__developer">Desarrollado por {game.developer}</p>}

        <a className="game-card__steam-link" href={`https://store.steampowered.com/app/${game.appid}/`} target="_blank" rel="noopener noreferrer">
          Ver en Steam
        </a>

        {game.genres.length > 0 && (
          <ul className="game-card__genres">
            {game.genres.map((genre, index) => (
              <li key={`${genre}-${index}`}>{genre}</li>
            ))}
          </ul>
        )}

        <p className="game-card__description">
          {game.short_description || "Sinopsis no disponible para este juego en Steam Store."}
        </p>

      </div>
      <aside className="game-card__sidebar">

        <div className="game-card__dashboard">
          <section className="game-card__panel">
            <h3>Tiempo Estimado (HLTB)</h3>
            <div className="game-card__stat"><span>Historia Principal</span><strong>{formatHours(game.hltb_main_hours)}</strong></div>
            <div className="game-card__stat"><span>Completista</span><strong>{formatHours(game.hltb_completionist_hours)}</strong></div>
            <div className="game-card__alert">
              <span>Dificultad de logros <strong>{game.achievement_difficulty}</strong></span>
            </div>
          </section>

          <section className="game-card__panel game-card__reviews-panel">
            <h3>Resumen de reseñas</h3>
            <strong>{game.review_score_desc || "Reseñas de la comunidad"}</strong>
            <span>{game.review_total > 0 ? `${game.review_total.toLocaleString("es-AR")} reseñas` : "Todavía no hay reseñas clasificadas"}</span>
            {featuredReview && <p>“{featuredReview}”</p>}
          </section>
        </div>

        <section className="game-card__progress">
          <div><span>Tu tiempo de juego</span><strong>{playtimeHours} h</strong></div>
        </section>
      </aside>
      {(
        isLoadingAchievements || achievementError || achievementProgress?.achievements?.length > 0 || !achievementProgress
      ) && (
        <section className="game-achievements">
          <div className="game-achievements__heading">
              <h3>{achievementProgress ? `${achievementProgress.unlocked}/${achievementProgress.total}` : "--/--"}</h3>
              <span>{isLoadingAchievements ? "Cargando progreso" : achievementError ? "Progreso no disponible" : "Progreso"}</span>
          </div>
          {achievementProgress?.achievements?.length > 0 && <div className="game-achievements__list">
            {achievementProgress.achievements.map((achievement, index) => (
              <article className={`achievement-item${achievement.achieved ? " achievement-item--unlocked" : ""}`} key={`${achievement.name}-${index}`}>
                {(achievement.achieved ? achievement.icon : achievement.icon_gray || achievement.icon) && (
                  <img src={achievement.achieved ? achievement.icon : achievement.icon_gray || achievement.icon} alt="" />
                )}
                <div>
                  <strong>{achievement.name || "Logro sin nombre"}</strong>
                  <p>{achievement.description || "Sin descripción disponible."}</p>
                </div>
              </article>
            ))}
          </div>}
        </section>
      )}
    </article>
  );
}

/** HowLongToBeat devuelve decimales (ej. 21.88): se muestran redondeados. */
function formatHours(hours) {
  if (hours == null) return "Sin datos";
  if (hours < 1) return "< 1 h";
  return `${Math.round(hours)} h`;
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
