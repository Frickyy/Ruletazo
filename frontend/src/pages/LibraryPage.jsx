import { useEffect, useRef, useState } from "react";
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
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [sortDirection, setSortDirection] = useState("asc");
  const [genres, setGenres] = useState([]);
  const [status, setStatus] = useState(null);
  const [isClassifying, setIsClassifying] = useState(false);
  const stopClassificationRef = useRef(false);

  useEffect(() => {
    if (!steamId) return;
    loadLibrary();
  }, [steamId, friendSteamId, collection, genre, search, sortBy, sortDirection]);

  useEffect(() => {
    if (!steamId) return;
    loadGenres();
    loadStatus();
  }, [steamId, friendSteamId]);

  async function loadLibrary() {
    setIsLoading(true);
    setError(null);
    try {
      setGames(await fetchLibrary({
        steamId,
        friendSteamId,
        collection,
        genre: genre || undefined,
        search: search || undefined,
        sortBy,
        sortDirection,
      }));
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

  // Las tandas siguen separadas para que la biblioteca no quede bloqueada durante el proceso.
  async function handleClassifyMore() {
    setIsClassifying(true);
    stopClassificationRef.current = false;
    setError(null);
    try {
      let remaining = status?.total ? status.total - status.classified : 1;
      let total = status?.total ?? 0;

      while (remaining > 0 && !stopClassificationRef.current) {
        const result = await classifyLibraryBatch(steamId, CLASSIFY_BATCH_SIZE);
        remaining = result.remaining;
        total = result.total;
        setStatus({ classified: total - remaining, total });
      }

      await Promise.all([loadGenres(), loadLibrary()]);
    } catch (err) {
      setError(err.response?.data?.detail ?? "No se pudo clasificar la biblioteca.");
    } finally {
      setIsClassifying(false);
    }
  }

  function handleStopClassification() {
    stopClassificationRef.current = true;
  }

  async function handleToggleFavorite(target) {
    try {
      if (target.is_favorite) {
        await removeFavorite(steamId, target.appid);
      } else {
        await addFavorite(steamId, target.appid);
      }
      setGames((prev) => {
        if (target.is_favorite && collection === "favorites") {
          return prev.filter((game) => game.appid !== target.appid);
        }
        return prev.map((game) => (
          game.appid === target.appid ? { ...game, is_favorite: !target.is_favorite } : game
        ));
      });
    } catch (err) {
      setError(err.response?.data?.detail ?? "No se pudo actualizar favoritos.");
    }
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

      <div className="library-page__tools">
        <form
          className="library-page__search"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchDraft.trim());
          }}
        >
          <label htmlFor="library-search">Buscar por nombre</label>
          <div className="library-page__search-row">
            <input
              id="library-search"
              type="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Escribí y presioná Enter"
            />
            <button type="submit">Buscar</button>
          </div>
        </form>
        <label className="library-page__sort">
          Ordenar por
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="name">Nombre</option>
            <option value="price">Precio</option>
            <option value="release_date">Fecha de salida</option>
          </select>
        </label>
        <button
          type="button"
          className="library-page__direction"
          onClick={() => setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"))}
          title={sortDirection === "asc" ? "Orden ascendente" : "Orden descendente"}
        >
          {sortDirection === "asc" ? "A → Z / menor → mayor" : "Z → A / mayor → menor"}
        </button>
      </div>

      {status && status.total > 0 && status.classified < status.total && (
        <div className="library-page__classify">
          <p>
            🏷️ Clasificados {status.classified} / {status.total} juegos (género, reseñas, HowLongToBeat, logros).
            Esto pega contra la Store de Steam de a un juego por vez, así que puede tardar.
          </p>
          <button type="button" onClick={handleClassifyMore} disabled={isClassifying}>
            {isClassifying ? "Clasificando automáticamente…" : "Clasificar toda la biblioteca"}
          </button>
          {isClassifying && (
            <button type="button" className="library-page__stop" onClick={handleStopClassification}>
              Detener después de esta tanda
            </button>
          )}
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
              <p className="library-row__meta">
                🕒 {Math.round(game.playtime_forever_minutes / 60)} h
                {game.price_cents != null && ` · ${formatPrice(game.price_cents)}`}
                {game.release_date && ` · ${formatReleaseDate(game.release_date)}`}
              </p>
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

function formatPrice(priceCents) {
  if (priceCents === 0) return "Gratis";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD" }).format(priceCents / 100);
}

function formatReleaseDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("es-AR");
}

export default LibraryPage;
