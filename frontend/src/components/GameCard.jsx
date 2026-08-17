/**
 * Componente "tonto" (presentacional): recibe datos por props y solo los muestra.
 * No sabe de dónde vienen los datos ni cómo se piden — esa responsabilidad
 * es del hook `useRandomGame` y del `gameService`. `onToggleFavorite` es opcional:
 * si no se pasa, no se muestra la estrella (ej. mientras no hay SteamID cargado).
 */
function GameCard({ game, onToggleFavorite }) {
  const playtimeHours = Math.round(game.playtime_forever_minutes / 60);
  const hasHltbData = game.hltb_main_hours != null || game.hltb_completionist_hours != null;

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
          {game.source === "friend" && <span className="game-card__source"> 👪 de tu familia</span>}
          {game.source === "both" && <span className="game-card__source"> 👪 en ambas bibliotecas</span>}
        </h2>

        {game.genres.length > 0 && (
          <ul className="game-card__genres">
            {game.genres.map((genre, index) => (
              <li key={`${genre}-${index}`}>{genre}</li>
            ))}
          </ul>
        )}

        {game.short_description && <p className="game-card__description">{game.short_description}</p>}

        <ul className="game-card__stats">
          <li>
            🕒 Jugado: <strong>{playtimeHours} h</strong>
          </li>
          {hasHltbData && (
            <li>
              ⏱️ HowLongToBeat:{" "}
              {game.hltb_main_hours != null && (
                <>
                  historia <strong>{game.hltb_main_hours} h</strong>
                </>
              )}
              {game.hltb_main_hours != null && game.hltb_completionist_hours != null && " · "}
              {game.hltb_completionist_hours != null && (
                <>
                  100% <strong>{game.hltb_completionist_hours} h</strong>
                </>
              )}
            </li>
          )}
          <li>
            🏆 Dificultad de logros: <strong>{game.achievement_difficulty}</strong>
          </li>
        </ul>

        {game.review_score_desc && (
          <div className="game-card__reviews">
            <p className="game-card__review-score">
              📝 {game.review_score_desc} · {game.review_total.toLocaleString("es-AR")} reseñas
            </p>
            {game.featured_reviews.length > 0 && (
              <ul className="game-card__featured-reviews">
                {game.featured_reviews.map((review, index) => (
                  <li key={index}>“{review}”</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export default GameCard;
