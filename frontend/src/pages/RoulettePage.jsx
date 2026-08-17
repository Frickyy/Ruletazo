import { useEffect, useState } from "react";
import { useRandomGame } from "../hooks/useRandomGame.js";
import { addFavorite, fetchGenres, removeFavorite } from "../services/gameService.js";
import GameCard from "../components/GameCard.jsx";
import RouletteButton from "../components/RouletteButton.jsx";
import "../components/GameCard.css";
import "./RoulettePage.css";

function RoulettePage({ steamId, friendSteamId }) {
  const { game, isLoading, error, spin, setGame } = useRandomGame();
  const [collection, setCollection] = useState("all");
  const [genre, setGenre] = useState("");
  const [genres, setGenres] = useState([]);

  // Los géneros disponibles dependen de cuánto de la biblioteca ya se clasificó
  // (ver "Clasificar biblioteca" en Mi biblioteca), por eso se refrescan acá también.
  useEffect(() => {
    if (!steamId) {
      setGenres([]);
      setGenre("");
      return;
    }
    fetchGenres({ steamId, friendSteamId })
      .then(setGenres)
      .catch(() => setGenres([]));
  }, [steamId, friendSteamId]);

  function handleSpin() {
    spin({ steamId, friendSteamId, collection, genre: genre || undefined });
  }

  async function handleToggleFavorite(target) {
    if (!steamId) return;
    if (target.is_favorite) {
      await removeFavorite(steamId, target.appid);
    } else {
      await addFavorite(steamId, target.appid);
    }
    setGame({ ...target, is_favorite: !target.is_favorite });
  }

  return (
    <section className="roulette-page">
      {steamId && (
        <div className="roulette-page__filters">
          <div className="collection-toggle">
            <button type="button" className={collection === "all" ? "active" : ""} onClick={() => setCollection("all")}>
              🎲 Todos
            </button>
            <button
              type="button"
              className={collection === "favorites" ? "active" : ""}
              onClick={() => setCollection("favorites")}
            >
              ⭐ Favoritos
            </button>
          </div>

          {genres.length > 0 && (
            <select
              className="genre-select"
              value={genre}
              onChange={(event) => setGenre(event.target.value)}
              aria-label="Filtrar por género"
            >
              <option value="">Todos los géneros</option>
              {genres.map((genreOption) => (
                <option key={genreOption} value={genreOption}>
                  {genreOption}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <RouletteButton onSpin={handleSpin} isLoading={isLoading} />

      {error && <p className="roulette-page__error">{error}</p>}

      {!error && !game && !isLoading && (
        <p className="roulette-page__hint">
          {steamId
            ? "Presioná el botón para elegir un juego al azar de tu biblioteca de Steam."
            : "Presioná el botón para probar con la biblioteca de ejemplo, o ingresá tu SteamID arriba."}
        </p>
      )}

      {game && <GameCard game={game} onToggleFavorite={steamId ? handleToggleFavorite : undefined} />}
    </section>
  );
}

export default RoulettePage;
