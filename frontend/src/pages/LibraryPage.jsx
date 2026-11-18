import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { addFavorite, removeFavorite, unhideGame } from "../services/gameService.js";
import { DURATION_OPTIONS, PLAYTIME_OPTIONS, SORT_OPTIONS, genresOf, matchesFilters, sortGames } from "../services/libraryFilters.js";
import "./LibraryPage.css";

// Filas que se dibujan de entrada; al llegar al final se suman de a tanto (con 1000+ juegos,
// dibujarlos todos juntos trababa la página).
const PAGE_SIZE = 60;

/**
 * Explorador de la biblioteca. Filtra y ordena en el navegador sobre la lista compartida
 * (useLibrary): buscar, cambiar de orden o de filtro no vuelve a pedir nada al backend.
 */
function LibraryPage({
  steamId,
  library,
  hideAdult,
  onHideAdultChange,
  playtimeFilter = "all",
  onPlaytimeFilterChange,
  includeFamily,
  onIncludeFamilyChange,
  onManageFamily,
}) {
  const { games, status, error: loadError, updateGame, classification, setClassificationPaused } = library;
  const [collection, setCollection] = useState("all");
  const [genre, setGenre] = useState("");
  const [duration, setDuration] = useState("any");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [sortDirection, setSortDirection] = useState("asc");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [actionError, setActionError] = useState(null);
  const sentinelRef = useRef(null);
  // Mientras se escribe, la lista se actualiza sin trabar el campo de búsqueda.
  const deferredSearch = useDeferredValue(search);

  const genres = useMemo(() => genresOf(games), [games]);
  const hiddenCount = useMemo(() => games.filter((game) => game.is_hidden).length, [games]);
  const filtered = useMemo(() => {
    const filters = { collection, genre, playtimeFilter, duration, hideAdult, search: deferredSearch };
    return sortGames(
      games.filter((game) => matchesFilters(game, filters)),
      sortBy,
      sortDirection,
    );
  }, [games, collection, genre, playtimeFilter, duration, hideAdult, deferredSearch, sortBy, sortDirection]);

  // Filtros nuevos → se vuelve a mostrar desde el principio.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [collection, genre, playtimeFilter, duration, hideAdult, deferredSearch, sortBy, sortDirection]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setVisibleCount((count) => count + PAGE_SIZE);
      },
      { rootMargin: "600px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filtered.length > visibleCount]);

  async function handleToggleFavorite(game) {
    setActionError(null);
    try {
      if (game.is_favorite) await removeFavorite(steamId, game.appid);
      else await addFavorite(steamId, game.appid);
      updateGame(game.appid, { is_favorite: !game.is_favorite });
    } catch (err) {
      setActionError(err.response?.data?.detail ?? "No se pudo actualizar favoritos.");
    }
  }

  async function handleUnhide(game) {
    setActionError(null);
    try {
      await unhideGame(game.appid);
      updateGame(game.appid, { is_hidden: false });
    } catch (err) {
      setActionError(err.response?.data?.detail ?? "No se pudo volver a mostrar el juego.");
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

  const isLoading = status === "loading";
  const needsStoreData = ["price", "release_date", "duration"].includes(sortBy) || duration !== "any";

  return (
    <section className="library-page" aria-labelledby="library-title">
      <div className="library-page__heading">
        <h1 id="library-title">Biblioteca</h1>
        {!isLoading && (
          <p className="library-page__count mono">
            {filtered.length.toLocaleString("es-AR")} de {games.length.toLocaleString("es-AR")} juegos
          </p>
        )}
      </div>

      <div className="library-page__tools">
        <div className="library-page__search">
          <label htmlFor="library-search" className="visually-hidden">Buscar por nombre</label>
          <input
            id="library-search"
            className="text-input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre"
            autoComplete="off"
          />
        </div>

        <div className="segmented" role="group" aria-label="Colección">
          <button type="button" aria-pressed={collection === "all"} onClick={() => setCollection("all")}>
            Todos
          </button>
          <button type="button" aria-pressed={collection === "favorites"} onClick={() => setCollection("favorites")}>
            Favoritos
          </button>
          <button type="button" aria-pressed={collection === "hidden"} onClick={() => setCollection("hidden")}>
            Ocultos{hiddenCount > 0 ? ` (${hiddenCount})` : ""}
          </button>
        </div>

        <select className="select" value={playtimeFilter} onChange={(event) => onPlaytimeFilterChange?.(event.target.value)} aria-label="Horas jugadas">
          {PLAYTIME_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>

        <select className="select" value={duration} onChange={(event) => setDuration(event.target.value)} aria-label="Duración">
          {DURATION_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>

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
            {SORT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
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
            <input type="checkbox" checked={hideAdult} onChange={(event) => onHideAdultChange?.(event.target.checked)} />
            Ocultar +18
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={includeFamily} onChange={(event) => onIncludeFamilyChange?.(event.target.checked)} />
            Incluir Familia
          </label>
          <button type="button" className="text-button" onClick={onManageFamily}>
            Administrar
          </button>
        </div>
      </div>

      {classification && classification.total > 0 && classification.classified < classification.total && (
        <div className="library-page__classify">
          <div className="library-page__classify-bar" aria-hidden="true">
            <span style={{ width: `${(classification.classified / classification.total) * 100}%` }} />
          </div>
          <p>
            <span className="mono">
              {classification.classified.toLocaleString("es-AR")}/{classification.total.toLocaleString("es-AR")}
            </span>{" "}
            juegos con datos de la tienda (género, duración, precio, reseñas).{" "}
            {classification.paused
              ? "Pausado."
              : classification.running
                ? "Se completan solos en segundo plano, de a poco para no saturar a Steam."
                : "Steam no respondió; se reintenta la próxima vez que abras la app."}
            {needsStoreData && " Los juegos sin datos quedan al final o fuera del filtro."}
          </p>
          <button type="button" className="button" onClick={() => setClassificationPaused(!classification.paused)}>
            {classification.paused ? "Reanudar" : "Pausar"}
          </button>
        </div>
      )}

      {(loadError || actionError) && <p className="error-text">{actionError ?? loadError}</p>}
      {isLoading && <p className="hint">Cargando biblioteca…</p>}

      <ul className="library-page__list">
        {filtered.slice(0, visibleCount).map((game) => (
          <li key={game.appid} className="library-row">
            <img className="library-row__image" src={game.header_image} alt="" loading="lazy" />
            <div className="library-row__body">
              <p className="library-row__name">
                {game.name}
                {game.source === "friend" && <span className="tag">Familia</span>}
                {game.source === "both" && <span className="tag">Ambas</span>}
              </p>
              <p className="library-row__genres">
                {[game.genres.join(" · "), game.hltb_main_hours != null ? `${Math.round(game.hltb_main_hours)} h de historia` : ""]
                  .filter(Boolean)
                  .join(" — ")}
              </p>
            </div>
            <p className="library-row__meta mono">
              <span>{Math.round(game.playtime_forever_minutes / 60)} h jugadas</span>
              <span>{game.price_cents != null ? formatPrice(game.price_cents) : ""}</span>
              <span>{game.release_date ? formatReleaseDate(game.release_date) : ""}</span>
            </p>
            {game.is_hidden ? (
              <button type="button" className="button library-row__unhide" onClick={() => handleUnhide(game)}>
                Volver a mostrar
              </button>
            ) : (
              <button
                type="button"
                className="favorite-button"
                onClick={() => handleToggleFavorite(game)}
                aria-pressed={game.is_favorite}
                aria-label={game.is_favorite ? `Quitar ${game.name} de favoritos` : `Agregar ${game.name} a favoritos`}
              >
                {game.is_favorite ? "★" : "☆"}
              </button>
            )}
          </li>
        ))}
      </ul>
      {filtered.length > visibleCount && <div ref={sentinelRef} className="library-page__sentinel" aria-hidden="true" />}

      {!isLoading && filtered.length === 0 && !loadError && (
        <p className="hint">
          {collection === "hidden" ? "No ocultaste ningún juego." : "No hay juegos que coincidan con esos filtros."}
        </p>
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
