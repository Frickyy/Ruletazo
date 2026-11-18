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

function LibraryPage({ steamId, friendSteamId, playtimeFilter = "all", includeFamily, onIncludeFamilyChange, onManageFamily }) {
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
  }, [steamId, friendSteamId, collection, genre, search, sortBy, sortDirection, playtimeFilter]);

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
        playtimeFilter,
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
    return (
      <section className="library-page">
        <h1>Biblioteca</h1>
        <p className="hint">Iniciá sesión con Steam para ver tu biblioteca.</p>
      </section>
    );
  }

  const isClassificationPending = status && status.total > 0 && status.classified < status.total;

  return (
    <section className="library-page" aria-labelledby="library-title">
      <div className="library-page__heading">
        <h1 id="library-title">Biblioteca</h1>
        {!isLoading && <p className="library-page__count mono">{games.length} juegos</p>}
      </div>

      <div className="library-page__tools">
        <form
          className="library-page__search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchDraft.trim());
          }}
        >
          <label htmlFor="library-search" className="visually-hidden">Buscar por nombre</label>
          <input
            id="library-search"
            className="text-input"
            type="search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Buscar por nombre y Enter"
          />
          <button type="submit" className="button">Buscar</button>
        </form>

        <div className="segmented" role="group" aria-label="Colección">
          <button type="button" aria-pressed={collection === "all"} onClick={() => setCollection("all")}>
            Todos
          </button>
          <button type="button" aria-pressed={collection === "favorites"} onClick={() => setCollection("favorites")}>
            Favoritos
          </button>
        </div>

        {genres.length > 0 && (
          <select className="select" value={genre} onChange={(event) => setGenre(event.target.value)} aria-label="Filtrar por género">
            <option value="">Todos los géneros</option>
            {genres.map((genreOption) => (
              <option key={genreOption} value={genreOption}>
                {genreOption}
              </option>
            ))}
          </select>
        )}

        <div className="library-page__sort">
          <select className="select" value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Ordenar por">
            <option value="name">Nombre</option>
            <option value="price">Precio</option>
            <option value="release_date">Fecha de salida</option>
          </select>
          <button
            type="button"
            className="button"
            onClick={() => setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"))}
            aria-label={sortDirection === "asc" ? "Orden ascendente, cambiar a descendente" : "Orden descendente, cambiar a ascendente"}
          >
            {sortDirection === "asc" ? "↑ Asc" : "↓ Desc"}
          </button>
        </div>

        <div className="library-page__family">
          <label className="checkbox">
            <input type="checkbox" checked={includeFamily} onChange={(event) => onIncludeFamilyChange?.(event.target.checked)} />
            Incluir Familia
          </label>
          <button type="button" className="text-button" onClick={onManageFamily}>
            Administrar
          </button>
        </div>
      </div>

      {isClassificationPending && (
        <div className="library-page__classify">
          <p>
            <span className="mono">{status.classified}/{status.total}</span> juegos clasificados (género, reseñas, HowLongToBeat y logros).
            Se consulta la tienda de Steam de a un juego, así que puede tardar.
          </p>
          <div className="library-page__classify-actions">
            <button type="button" className="button button--primary" onClick={handleClassifyMore} disabled={isClassifying}>
              {isClassifying ? "Clasificando…" : "Clasificar toda la biblioteca"}
            </button>
            {isClassifying && (
              <button type="button" className="button" onClick={handleStopClassification}>
                Detener después de esta tanda
              </button>
            )}
          </div>
        </div>
      )}

      {sortBy !== "name" && isLoading && (
        <p className="hint">Ordenar por precio o fecha consulta la tienda de Steam la primera vez: puede tardar un par de minutos.</p>
      )}
      {error && <p className="error-text">{error}</p>}
      {isLoading && <p className="hint">Cargando biblioteca…</p>}

      <ul className="library-page__list">
        {games.map((game) => (
          <li key={game.appid} className="library-row">
            <img className="library-row__image" src={game.header_image} alt="" loading="lazy" />
            <div className="library-row__body">
              <p className="library-row__name">
                {game.name}
                {game.source === "friend" && <span className="tag">Familia</span>}
                {game.source === "both" && <span className="tag">Ambas</span>}
              </p>
              {game.genres.length > 0 && <p className="library-row__genres">{game.genres.join(" · ")}</p>}
            </div>
            <p className="library-row__meta mono">
              <span>{Math.round(game.playtime_forever_minutes / 60)} h</span>
              <span>{game.price_cents != null ? formatPrice(game.price_cents) : ""}</span>
              <span>{game.release_date ? formatReleaseDate(game.release_date) : ""}</span>
            </p>
            <button
              type="button"
              className="favorite-button"
              onClick={() => handleToggleFavorite(game)}
              aria-pressed={game.is_favorite}
              aria-label={game.is_favorite ? `Quitar ${game.name} de favoritos` : `Agregar ${game.name} a favoritos`}
            >
              {game.is_favorite ? "★" : "☆"}
            </button>
          </li>
        ))}
      </ul>

      {!isLoading && games.length === 0 && !error && (
        <p className="hint">No hay juegos que coincidan con ese filtro.</p>
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
