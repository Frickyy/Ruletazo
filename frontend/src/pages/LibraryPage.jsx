import { useEffect, useState } from "react";
import {
  addFavorite,
  classifyLibraryBatch,
  fetchClassificationStatus,
  fetchGenres,
  fetchLibrary,
  removeFavorite,
} from "../services/gameService.js";
import "./LibraryPage.css";

// Cuántos juegos sin clasificar se piden por tanda al backend (ver services/library_service.py).
const CLASSIFY_BATCH_SIZE = 10;

function LibraryPage({ steamId, friendSteamId }) {
  const [games, setGames] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [collection, setCollection] = useState("all");
  const [genre, setGenre] = useState("");
  const [genres, setGenres] = useState([]);
  const [status, setStatus] = useState(null);
  const [isClassifying, setIsClassifying] = useState(false);

  useEffect(() => {
    if (!steamId) return;
    loadLibrary();
    loadGenres();
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steamId, friendSteamId, collection, genre]);

  async function loadLibrary() {
    setIsLoading(true);
    setError(null);
    try {
      setGames(await fetchLibrary({ steamId, friendSteamId, collection, genre: genre || undefined }));
    } catch (err) {
      setError(err.response?.data?.detail ?? "No se pudo cargar la biblioteca.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadGenres() {
    try {
      setGenres(await fetchGenres({ steamId, friendSteamId }));
    } catch {
      setGenres([]);
    }
  }

  async function loadStatus() {
    try {
      setStatus(await fetchClassificationStatus(steamId));
    } catch {
      setStatus(null);
    }
  }

  // La Store API de Steam no tiene un límite documentado, así que se clasifica de a poco:
  // se llama repetidas veces hasta terminar, mostrando el progreso en vivo.
  async function handleClassifyMore() {
    setIsClassifying(true);
    setError(null);
    try {
      let remaining = 1;
      while (remaining > 0) {
        const result = await classifyLibraryBatch(steamId, CLASSIFY_BATCH_SIZE);
        remaining = result.remaining;
        setStatus({ classified: result.total - remaining, total: result.total });
      }
      await Promise.all([loadGenres(), loadLibrary()]);
    } catch (err) {
      setError(err.response?.data?.detail ?? "No se pudo clasificar la biblioteca.");
    } finally {
      setIsClassifying(false);
    }
  }

  async function handleToggleFavorite(target) {
    if (target.is_favorite) {
      await removeFavorite(steamId, target.appid);
    } else {
      await addFavorite(steamId, target.appid);
    }
    setGames((prev) => prev.map((g) => (g.appid === target.appid ? { ...g, is_favorite: !g.is_favorite } : g)));
  }

  if (!steamId) {
    return <p className="roulette-page__hint">Ingresá tu SteamID arriba para ver tu biblioteca.</p>;
  }

  return (
    <section className="library-page">
      <div className="roulette-page__filters">
        <div className="collection-toggle">
          <button type="button" className={collection === "all" ? "active" : ""} onClick={() => setCollection("all")}>
            📚 Todos
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

      {status && status.total > 0 && status.classified < status.total && (
        <div className="library-page__classify">
          <p>
            🏷️ Clasificados {status.classified} / {status.total} juegos (género, reseñas, HowLongToBeat, logros).
            Esto pega contra la Store de Steam de a un juego por vez, así que puede tardar.
          </p>
          <button type="button" onClick={handleClassifyMore} disabled={isClassifying}>
            {isClassifying ? "Clasificando…" : "Clasificar más"}
          </button>
        </div>
      )}

      {error && <p className="roulette-page__error">{error}</p>}
      {isLoading && <p className="roulette-page__hint">Cargando biblioteca…</p>}

      <ul className="library-page__list">
        {games.map((game) => (
          <li key={game.appid} className="library-row">
            <img className="library-row__image" src={game.header_image} alt={`Portada de ${game.name}`} />
            <div className="library-row__body">
              <p className="library-row__name">
                {game.name}
                {game.source === "friend" && <span className="game-card__source"> 👪</span>}
                {game.source === "both" && <span className="game-card__source"> 👪👪</span>}
              </p>
              {game.genres.length > 0 && <p className="library-row__genres">{game.genres.join(" · ")}</p>}
              <p className="library-row__playtime">🕒 {Math.round(game.playtime_forever_minutes / 60)} h</p>
            </div>
            <button
              type="button"
              className={`game-card__favorite${game.is_favorite ? " game-card__favorite--active" : ""}`}
              onClick={() => handleToggleFavorite(game)}
              title={game.is_favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
              aria-label={game.is_favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
            >
              {game.is_favorite ? "★" : "☆"}
            </button>
          </li>
        ))}
      </ul>

      {!isLoading && games.length === 0 && !error && (
        <p className="roulette-page__hint">No hay juegos que coincidan con ese filtro.</p>
      )}
    </section>
  );
}

export default LibraryPage;
