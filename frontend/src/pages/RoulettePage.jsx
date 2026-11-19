import { useEffect, useMemo, useState } from "react";
import { addFavorite, fetchGameDetails, fetchGenres, fetchLibrary, fetchPlayerAchievements, removeFavorite } from "../services/gameService.js";
import GameCard from "../components/GameCard.jsx";
import IdlePanel from "../components/IdlePanel.jsx";
import { coverAccent } from "../services/coverColor.js";
import Reel from "../components/Reel.jsx";
import "../components/GameCard.css";
import "./RoulettePage.css";

const PLAYTIME_OPTIONS = [
  { id: "all", label: "Toda la biblioteca" },
  { id: "zero", label: "0 horas" },
  { id: "under2", label: "Menos de 2 h" },
];

/**
 * Ruleta "en vivo": el juego que gana es el que frena en la ventana del rodillo.
 * Al tocar "Girar" se elige el ganador entre los juegos que cumplen los filtros, el rodillo
 * gira hasta él y, en paralelo, se pide su ficha completa al backend.
 */
function RoulettePage({ steamId, isLoggedIn, friendSteamId, hasFamily, playtimeFilter = "all", onPlaytimeFilterChange, includeFamily, onIncludeFamilyChange, onOpenForum, onLogin }) {
  const [collection, setCollection] = useState("all");
  const [genre, setGenre] = useState("");
  const [genres, setGenres] = useState([]);
  const [library, setLibrary] = useState([]);
  const [libraryStatus, setLibraryStatus] = useState("idle"); // idle | loading | ready | error
  const [spin, setSpin] = useState(null); // { id, winner }
  const [settledSpinId, setSettledSpinId] = useState(null);
  const [details, setDetails] = useState(null); // { spinId, game, error }
  const [achievementProgress, setAchievementProgress] = useState(null);
  const [isLoadingAchievements, setIsLoadingAchievements] = useState(false);
  const [achievementError, setAchievementError] = useState(false);

  useEffect(() => {
    if (!steamId) {
      setLibrary([]);
      setLibraryStatus("idle");
      return undefined;
    }
    let cancelled = false;
    setLibraryStatus("loading");
    fetchLibrary({ steamId, friendSteamId })
      .then((games) => {
        if (cancelled) return;
        setLibrary(games);
        setLibraryStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setLibrary([]);
        setLibraryStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [steamId, friendSteamId]);

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

  // Los juegos que pueden salir: exactamente los que cumplen los filtros actuales.
  const pool = useMemo(() => {
    if (!steamId) return DEMO_GAMES;
    return library
      .filter((item) => matchesFilters(item, { collection, genre, playtimeFilter }))
      .map((item) => ({ appid: item.appid, name: item.name, image: item.header_image }));
  }, [steamId, library, collection, genre, playtimeFilter]);

  const isSpinning = spin !== null && settledSpinId !== spin.id;
  const isLoadingDetails = spin !== null && settledSpinId === spin.id && details?.spinId !== spin.id;
  const shownGame = spin && details?.spinId === settledSpinId ? details.game : null;
  const detailsError = spin && details?.spinId === settledSpinId ? details.error : null;
  const unplayedCount = useMemo(() => library.filter((item) => item.playtime_forever_minutes === 0).length, [library]);
  const libraryLoading = Boolean(steamId) && libraryStatus === "loading";
  const canSpin = !isSpinning && !libraryLoading && pool.length > 0;

  useEffect(() => {
    // Los logros son los tuyos: un juego que solo tiene un familiar no tiene progreso propio.
    if (!steamId || !shownGame || shownGame.source === "friend") {
      setAchievementProgress(null);
      setIsLoadingAchievements(false);
      setAchievementError(false);
      return;
    }
    setIsLoadingAchievements(true);
    setAchievementError(false);
    fetchPlayerAchievements(steamId, shownGame.appid)
      .then((progress) => {
        setAchievementProgress(progress);
        setIsLoadingAchievements(false);
      })
      .catch(() => {
        setAchievementProgress(null);
        setIsLoadingAchievements(false);
        setAchievementError(true);
      });
  }, [steamId, shownGame?.appid]);

  // La página toma el color que predomina en la portada del juego que tocó (ver coverColor.js).
  // Al salir de la ruleta vuelve el rosa de siempre.
  const settledWinner = spin && settledSpinId === spin.id ? spin.winner : null;
  useEffect(() => {
    if (!settledWinner) return;
    let cancelled = false;
    coverAccent(settledWinner.image).then((colors) => {
      if (!cancelled) applyAccent(colors);
    });
    return () => {
      cancelled = true;
    };
  }, [settledWinner?.appid, settledWinner?.image]);

  useEffect(() => () => applyAccent(null), []);

  function handleSpin() {
    if (!canSpin) return;
    showGame(pool[Math.floor(Math.random() * pool.length)]);
  }

  /** Elegido a mano desde el panel de abajo: queda en el centro del rodillo sin girar. */
  function handlePick(game) {
    if (isSpinning) return;
    showGame({ appid: game.appid, name: game.name, image: game.header_image }, { instant: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showGame(winner, { instant = false } = {}) {
    const spinId = Date.now();
    setSpin({ id: spinId, winner, instant });
    fetchGameDetails({ steamId, friendSteamId, appid: winner.appid })
      .then((game) => setDetails({ spinId, game, error: null }))
      .catch((err) =>
        setDetails({ spinId, game: null, error: err.response?.data?.detail ?? "No se pudo cargar la ficha del juego." })
      );
  }

  async function handleToggleFavorite(target) {
    if (!isLoggedIn) return;
    const nextValue = !target.is_favorite;
    try {
      if (nextValue) {
        await addFavorite(steamId, target.appid);
      } else {
        await removeFavorite(steamId, target.appid);
      }
    } catch {
      return;
    }
    setDetails((current) => (current ? { ...current, game: { ...current.game, is_favorite: nextValue } } : current));
    setLibrary((current) => current.map((item) => (item.appid === target.appid ? { ...item, is_favorite: nextValue } : item)));
  }

  let status = null;
  if (libraryLoading) status = <p className="hint roulette__hint">Cargando tu biblioteca…</p>;
  else if (steamId && libraryStatus === "error") status = <p className="error-text roulette__hint">No se pudo cargar tu biblioteca. ¿El perfil es público?</p>;
  else if (pool.length === 0) status = <p className="hint roulette__hint">No hay juegos que cumplan esos filtros. Probá con otros.</p>;
  else if (isLoadingDetails) status = <p className="hint roulette__hint">Cargando la ficha de {spin.winner.name}…</p>;
  else if (detailsError) status = <p className="error-text roulette__hint">{detailsError}</p>;

  return (
    <section className="roulette" aria-labelledby="roulette-title">
      <header className="roulette__hero">
        <div className="roulette__title">
          <p className="eyebrow">{steamId ? "Tu biblioteca, a la suerte" : "Biblioteca de ejemplo"}</p>
          <h1 id="roulette-title">¿Qué jugamos hoy?</h1>
          <p className="roulette__lead">
            {steamId
              ? "Girá la ruleta: el juego que frene en el centro es el que te toca."
              : "Probá la ruleta con 5 juegos de ejemplo, o iniciá sesión para girar con tu biblioteca."}
          </p>
        </div>
        {library.length > 0 && (
          <dl className="roulette__stats">
            <div>
              <dt>juegos</dt>
              <dd>{library.length.toLocaleString("es-AR")}</dd>
            </div>
            <div>
              <dt>sin estrenar</dt>
              <dd>{unplayedCount.toLocaleString("es-AR")}</dd>
            </div>
            <div className="roulette__stat--accent">
              <dt>en la ruleta</dt>
              <dd>{pool.length.toLocaleString("es-AR")}</dd>
            </div>
          </dl>
        )}
      </header>

      <Reel pool={pool} spin={spin} onSettled={() => setSettledSpinId(spin?.id)} />
      <p className="visually-hidden" aria-live="polite">
        {isSpinning ? "Girando la ruleta…" : shownGame ? `Te tocó ${shownGame.name}` : ""}
      </p>

      <div className="roulette__controls">
        <button type="button" className="button button--primary button--large" onClick={handleSpin} disabled={!canSpin}>
          {isSpinning ? "Girando…" : "Girar la ruleta"}
        </button>

        <div className="segmented" role="group" aria-label="Horas jugadas">
          {PLAYTIME_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={playtimeFilter === option.id}
              onClick={() => onPlaytimeFilterChange?.(option.id)}
              disabled={isSpinning}
            >
              {option.label}
            </button>
          ))}
        </div>

        {steamId && (
          <div className="segmented" role="group" aria-label="Colección">
            <button type="button" aria-pressed={collection === "all"} onClick={() => setCollection("all")} disabled={isSpinning}>
              Todos
            </button>
            <button type="button" aria-pressed={collection === "favorites"} onClick={() => setCollection("favorites")} disabled={isSpinning}>
              Favoritos
            </button>
          </div>
        )}

        {steamId && genres.length > 0 && (
          <select className="select" value={genre} onChange={(event) => setGenre(event.target.value)} aria-label="Filtrar por género" disabled={isSpinning}>
            <option value="">Todos los géneros</option>
            {genres.map((genreOption) => (
              <option key={genreOption} value={genreOption}>
                {genreOption}
              </option>
            ))}
          </select>
        )}

        {steamId && hasFamily && (
          <label className="checkbox roulette__family">
            <input type="checkbox" checked={includeFamily} onChange={(event) => onIncludeFamilyChange?.(event.target.checked)} disabled={isSpinning} />
            Incluir biblioteca de Familia
          </label>
        )}
      </div>

      {status}

      {!spin && !libraryLoading && pool.length > 0 && (
        <IdlePanel steamId={steamId} library={library} pool={pool} onPick={handlePick} onLogin={onLogin} />
      )}

      {shownGame && (
        <GameCard
          game={shownGame}
          achievementProgress={achievementProgress}
          isLoadingAchievements={isLoadingAchievements}
          achievementError={achievementError}
          isDemo={!steamId}
          onToggleFavorite={isLoggedIn ? handleToggleFavorite : undefined}
          onOpenForum={onOpenForum}
        />
      )}
    </section>
  );
}

/** Pisa (o con null, restaura) el color de acento de toda la página. */
function applyAccent(colors) {
  const root = document.documentElement.style;
  if (colors) {
    root.setProperty("--accent", colors.accent);
    root.setProperty("--accent-hover", colors.hover);
  } else {
    root.removeProperty("--accent");
    root.removeProperty("--accent-hover");
  }
}

function matchesFilters(game, { collection, genre, playtimeFilter }) {
  if (collection === "favorites" && !game.is_favorite) return false;
  if (genre && !game.genres.includes(genre)) return false;
  if (playtimeFilter === "zero" && game.playtime_forever_minutes !== 0) return false;
  if (playtimeFilter === "under2" && game.playtime_forever_minutes >= 120) return false;
  return true;
}

function steamHeader(appid) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
}

// Sin sesión la ruleta usa la biblioteca de ejemplo del backend.
const DEMO_GAMES = [
  { appid: 1091500, name: "Cyberpunk 2077", image: steamHeader(1091500) },
  { appid: 1245620, name: "ELDEN RING", image: steamHeader(1245620) },
  { appid: 413150, name: "Stardew Valley", image: steamHeader(413150) },
  { appid: 1174180, name: "Red Dead Redemption 2", image: steamHeader(1174180) },
  { appid: 1145360, name: "Hades", image: steamHeader(1145360) },
];

export default RoulettePage;
