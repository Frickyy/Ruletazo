import GuestStart from "../components/GuestStart.jsx";
import SteamLoginButton from "../components/SteamLoginButton.jsx";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { addFavorite, fetchStateSummary, removeFavorite, setGameState, unhideGame } from "../services/gameService.js";
import GameStatePicker from "../components/GameStatePicker.jsx";
import {
  DURATION_OPTIONS,
  MODE_OPTIONS,
  PLAYTIME_OPTIONS,
  SORT_OPTIONS,
  STATE_LABELS,
  STATE_OPTIONS,
  durationFilterAvailable,
  genresOf,
  matchesFilters,
  sortGames,
} from "../services/libraryFilters.js";
import ClassificationBanner from "../components/ClassificationBanner.jsx";
import PrivateLibraryHelp from "../components/PrivateLibraryHelp.jsx";
import { formatNumber, locale, t } from "../i18n/index.js";
import { usePageTitle } from "../services/pageTitle.js";
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
  hideSoftware = true,
  onHideSoftwareChange,
  hideJunk = false,
  onHideJunkChange,
  playtimeFilter = "all",
  onPlaytimeFilterChange,
  includeFamily,
  onIncludeFamilyChange,
  onManageFamily,
  // Abre el foro de un juego (el mismo de "Foro del juego" en la tarjeta de la ruleta).
  onOpenForum,
  guest = null,
  onGuest,
  onLogin,
  // false mientras se averigua si hay sesión: así no aparece el formulario un instante.
  ready = true,
}) {
  usePageTitle(t("Biblioteca"));
  const { games, status, error: loadError, updateGame, classification, setClassificationPaused } = library;
  const [collection, setCollection] = useState("all");
  const [genre, setGenre] = useState("");
  const [duration, setDuration] = useState("any");
  const [mode, setMode] = useState("any");
  const [stateFilter, setStateFilter] = useState("any");
  const [summary, setSummary] = useState(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [sortDirection, setSortDirection] = useState("asc");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [actionError, setActionError] = useState(null);
  const sentinelRef = useRef(null);
  // Mientras se escribe, la lista se actualiza sin trabar el campo de búsqueda.
  const deferredSearch = useDeferredValue(search);
  // Biblioteca de un perfil pegado, sin sesión: se ve y se filtra, pero favoritos, ocultos y
  // estados son de cada cuenta.
  const readOnly = Boolean(guest);

  const genres = useMemo(() => genresOf(games), [games]);
  // La duración sale de IGDB o de quienes terminaron el juego en Ruletazo. Mientras la tenga
  // menos de la mitad de los juegos, el filtro no se muestra.
  const durationEnabled = useMemo(() => durationFilterAvailable(games), [games]);
  const hiddenCount = useMemo(() => games.filter((game) => game.is_hidden).length, [games]);
  const filtered = useMemo(() => {
    const filters = { collection, genre, playtimeFilter, duration: durationEnabled ? duration : "any", hideAdult, hideSoftware, hideJunk, mode, state: stateFilter, search: deferredSearch };
    return sortGames(
      games.filter((game) => matchesFilters(game, filters)),
      sortBy,
      sortDirection,
    );
  }, [games, collection, genre, playtimeFilter, duration, durationEnabled, hideAdult, hideSoftware, hideJunk, mode, stateFilter, deferredSearch, sortBy, sortDirection]);

  // Resumen de estados: se vuelve a pedir cuando cambia algún estado.
  const statesKey = useMemo(() => games.filter((game) => game.state).map((game) => `${game.appid}:${game.state}`).join(","), [games]);
  useEffect(() => {
    if (!steamId || readOnly) return;
    fetchStateSummary().then(setSummary).catch(() => setSummary(null));
  }, [steamId, readOnly, statesKey]);

  // Filtros nuevos → se vuelve a mostrar desde el principio.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [collection, genre, playtimeFilter, duration, hideAdult, hideSoftware, hideJunk, mode, stateFilter, deferredSearch, sortBy, sortDirection]);

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
      setActionError(err.response?.data?.detail ?? t("No se pudo actualizar favoritos."));
    }
  }

  async function handleSetState(game, state) {
    setActionError(null);
    try {
      await setGameState(game.appid, state);
      updateGame(game.appid, { state });
    } catch (err) {
      setActionError(err.response?.data?.detail ?? t("No se pudo guardar el estado. Probá de nuevo."));
    }
  }

  async function handleUnhide(game) {
    setActionError(null);
    try {
      await unhideGame(game.appid);
      updateGame(game.appid, { is_hidden: false });
    } catch (err) {
      setActionError(err.response?.data?.detail ?? t("No se pudo volver a mostrar el juego."));
    }
  }

  if (!steamId) {
    return (
      <section className="library-page">
        <h1>{t("Biblioteca")}</h1>
        {ready && (
          <>
            <p className="hint">{t("Toda tu colección de Steam en una lista, con búsqueda y los mismos filtros que la ruleta.")}</p>
            {onGuest ? (
              <GuestStart
                onGuest={onGuest}
                onLogin={onLogin}
                label={t("Pegá el link de tu perfil de Steam para ver tu biblioteca")}
                submitLabel={t("Ver mi biblioteca")}
              />
            ) : (
              onLogin && <SteamLoginButton onClick={onLogin} />
            )}
          </>
        )}
      </section>
    );
  }

  const isLoading = status === "loading";

  return (
    <section className="library-page" aria-labelledby="library-title">
      <div className="library-page__heading">
        <h1 id="library-title">{t("Biblioteca")}</h1>
        {!isLoading && (
          <p className="library-page__count mono">
            {t("{shown} de {total} juegos", { shown: formatNumber(filtered.length), total: formatNumber(games.length) })}
          </p>
        )}
      </div>

      {readOnly && (
        <p className="hint library-page__guest">
          {t("Es la biblioteca de {name}. Para marcar favoritos y guardar qué estás jugando, iniciá sesión con Steam.", {
            name: guest.name || t("un perfil público"),
          })}
          {onLogin && (
            <>
              {" "}
              <button type="button" className="text-button" onClick={onLogin}>
                {t("Iniciar sesión con Steam")}
              </button>
            </>
          )}
        </p>
      )}

      {summary && Object.values(summary.counts).some(Boolean) && (
        <dl className="library-summary">
          <div>
            <dt>{t("Jugando")}</dt>
            <dd>{summary.counts.playing}</dd>
          </div>
          <div>
            <dt>{t("Terminados")}</dt>
            <dd>{summary.counts.finished}</dd>
          </div>
          <div>
            <dt>{t("Abandonados")}</dt>
            <dd>{summary.counts.abandoned}</dd>
          </div>
          <p className="library-summary__year">
            {summary.finished_this_year === 1
              ? t("En {year} terminaste {finished} juego y empezaste {started}.", yearVars(summary))
              : t("En {year} terminaste {finished} juegos y empezaste {started}.", yearVars(summary))}
          </p>
        </dl>
      )}

      <div className="library-page__tools">
        <div className="library-page__search">
          <label htmlFor="library-search" className="visually-hidden">{t("Buscar por nombre")}</label>
          <input
            id="library-search"
            className="text-input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("Buscar por nombre")}
            autoComplete="off"
          />
        </div>

        {!readOnly && (
          <div className="segmented" role="group" aria-label={t("Colección")}>
            <button type="button" aria-pressed={collection === "all"} onClick={() => setCollection("all")}>
              {t("Todos")}
            </button>
            <button type="button" aria-pressed={collection === "favorites"} onClick={() => setCollection("favorites")}>
              {t("Favoritos")}
            </button>
            <button type="button" aria-pressed={collection === "hidden"} onClick={() => setCollection("hidden")}>
              {t("Ocultos")}{hiddenCount > 0 ? ` (${hiddenCount})` : ""}
            </button>
          </div>
        )}

        <select className="select" value={playtimeFilter} onChange={(event) => onPlaytimeFilterChange?.(event.target.value)} aria-label={t("Horas jugadas")}>
          {PLAYTIME_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {t(option.label)}
            </option>
          ))}
        </select>

        {!readOnly && (
          <select className="select" value={stateFilter} onChange={(event) => setStateFilter(event.target.value)} aria-label={t("Estado")}>
            {STATE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {t(option.label)}
              </option>
            ))}
          </select>
        )}

        <select className="select" value={mode} onChange={(event) => setMode(event.target.value)} aria-label={t("Modo de juego")}>
          {MODE_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {t(option.label)}
            </option>
          ))}
        </select>

        {durationEnabled && (
          <select className="select" value={duration} onChange={(event) => setDuration(event.target.value)} aria-label={t("Duración")}>
            {DURATION_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {t(option.label)}
              </option>
            ))}
          </select>
        )}

        {genres.length > 0 && (
          <select className="select" value={genre} onChange={(event) => setGenre(event.target.value)} aria-label={t("Filtrar por género")}>
            <option value="">{t("Todos los géneros")}</option>
            {genres.map((genreOption) => (
              <option key={genreOption} value={genreOption}>
                {t(genreOption)}
              </option>
            ))}
          </select>
        )}

        <div className="library-page__sort">
          <select className="select" value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label={t("Ordenar por")}>
            {SORT_OPTIONS.filter((option) => durationEnabled || option.id !== "duration").map((option) => (
              <option key={option.id} value={option.id}>
                {t(option.label)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="button"
            onClick={() => setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"))}
            aria-label={sortDirection === "asc" ? t("Orden ascendente, cambiar a descendente") : t("Orden descendente, cambiar a ascendente")}
          >
            {sortDirection === "asc" ? `↑ ${t("Asc")}` : `↓ ${t("Desc")}`}
          </button>
        </div>

        <div className="library-page__family">
          <label className="checkbox">
            <input type="checkbox" checked={hideAdult} onChange={(event) => onHideAdultChange?.(event.target.checked)} />
            {t("Ocultar +18")}
          </label>
          <label className="checkbox" title={t("Deja afuera lo que Steam lista como software, como Soundpad o Wallpaper Engine")}>
            <input type="checkbox" checked={hideSoftware} onChange={(event) => onHideSoftwareChange?.(event.target.checked)} />
            {t("Ocultar programas")}
          </label>
          <label className="checkbox" title={t("Deja afuera los que tienen menos de 50 reseñas en Steam o reseñas negativas: suelen ser los que se compran por los cromos. Nunca saca tus favoritos")}>
            <input type="checkbox" checked={hideJunk} onChange={(event) => onHideJunkChange?.(event.target.checked)} />
            {t("Ocultar juegos basura")}
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={includeFamily} onChange={(event) => onIncludeFamilyChange?.(event.target.checked)} />
            {t("Incluir Familia")}
          </label>
          <button type="button" className="text-button" onClick={onManageFamily}>
            {t("Administrar")}
          </button>
        </div>
      </div>

      <ClassificationBanner classification={classification} onPause={setClassificationPaused} />

      {library.isPrivate && !actionError ? (
        <PrivateLibraryHelp isOwn={!guest} onRetry={() => library.reload()} />
      ) : (
        (loadError || actionError) && <p className="error-text">{actionError ?? loadError}</p>
      )}
      {isLoading && <p className="hint">{t("Cargando biblioteca…")}</p>}

      <ul className="library-page__list">
        {filtered.slice(0, visibleCount).map((game) => (
          <li key={game.appid} className={readOnly ? "library-row library-row--read-only" : "library-row"}>
            <img className="library-row__image" src={game.header_image} alt="" loading="lazy" />
            <div className="library-row__body">
              <p className="library-row__name">
                {game.name}
                {game.source === "friend" && <span className="tag">{t("Familia")}</span>}
                {game.source === "both" && <span className="tag">{t("Ambas")}</span>}
                {game.state && (readOnly || game.source === "friend") && (
                  <span className={`tag tag--state tag--${game.state}`}>{t(STATE_LABELS[game.state])}</span>
                )}
                {game.coop && <span className="tag">{t("Coop")}</span>}
              </p>
              <p className="library-row__genres">
                {[game.genres.map((genre) => t(genre)).join(" · "), game.duration_hours != null ? t("{hours} h para terminarlo", { hours: Math.round(game.duration_hours) }) : ""]
                  .filter(Boolean)
                  .join(" — ")}
              </p>
              <div className="library-row__actions">
                {!readOnly && game.source !== "friend" && (
                  <GameStatePicker compact state={game.state} name={game.name} onChange={(state) => handleSetState(game, state)} />
                )}
                {onOpenForum && (
                  <button
                    type="button"
                    className="text-button library-row__forum"
                    onClick={() => onOpenForum({ appid: game.appid, name: game.name })}
                    aria-label={t("Foro de {name}", { name: game.name })}
                  >
                    {t("Foro del juego")}
                  </button>
                )}
              </div>
            </div>
            <p className="library-row__meta mono">
              <span>
                {t("{hours} h jugadas", { hours: Math.round(game.playtime_forever_minutes / 60) })}
                {game.achievements_total ? ` · ${t("{unlocked}/{total} logros", { unlocked: game.achievements_unlocked, total: game.achievements_total })}` : ""}
              </span>
              <span>{game.price_cents != null ? formatPrice(game.price_cents) : ""}</span>
              <span>{game.release_date ? formatReleaseDate(game.release_date) : ""}</span>
            </p>
            {readOnly ? null : game.is_hidden ? (
              <button type="button" className="button library-row__unhide" onClick={() => handleUnhide(game)}>
                {t("Volver a mostrar")}
              </button>
            ) : (
              <button
                type="button"
                className="favorite-button"
                onClick={() => handleToggleFavorite(game)}
                aria-pressed={game.is_favorite}
                aria-label={game.is_favorite ? t("Quitar {name} de favoritos", { name: game.name }) : t("Agregar {name} a favoritos", { name: game.name })}
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
          {collection === "hidden" ? t("No ocultaste ningún juego.") : t("No hay juegos que coincidan con esos filtros.")}
        </p>
      )}
    </section>
  );
}

function yearVars(summary) {
  return { year: summary.year, finished: summary.finished_this_year, started: summary.started_this_year };
}

function formatPrice(priceCents) {
  if (priceCents === 0) return t("Gratis");
  return new Intl.NumberFormat(locale(), { style: "currency", currency: "USD" }).format(priceCents / 100);
}

function formatReleaseDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(locale());
}

export default LibraryPage;
