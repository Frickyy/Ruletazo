import { useEffect, useMemo, useState } from "react";
import {
  addFavorite,
  fetchGameDetails,
  fetchPlayerAchievements,
  hideGame,
  removeFavorite,
  unhideGame,
} from "../services/gameService.js";
import GameCard from "../components/GameCard.jsx";
import IdlePanel from "../components/IdlePanel.jsx";
import SpinHistory, { useSpinHistory } from "../components/SpinHistory.jsx";
import { coverAccent } from "../services/coverColor.js";
import { DURATION_OPTIONS, PLAYTIME_OPTIONS, genresOf, matchesFilters } from "../services/libraryFilters.js";
import Reel from "../components/Reel.jsx";
import "../components/GameCard.css";
import "./RoulettePage.css";

/**
 * Ruleta "en vivo": el juego que gana es el que frena en el centro del rodillo.
 * Al tocar "Girar" se elige el ganador entre los juegos que cumplen los filtros, el rodillo
 * gira hasta él y, en paralelo, se pide su ficha completa al backend.
 * La biblioteca llega ya cargada (useLibrary en App) y los filtros se aplican acá mismo.
 */
function RoulettePage({
  steamId,
  isLoggedIn,
  friendSteamId,
  library,
  hideAdult,
  onHideAdultChange,
  hasFamily,
  playtimeFilter = "all",
  onPlaytimeFilterChange,
  includeFamily,
  onIncludeFamilyChange,
  onOpenForum,
  onLogin,
}) {
  const { games, status: libraryStatus, error: libraryError, updateGame } = library;
  const [collection, setCollection] = useState("all");
  const [genre, setGenre] = useState("");
  const [duration, setDuration] = useState("any");
  const [spin, setSpin] = useState(null); // { id, winner, instant }
  const [settledSpinId, setSettledSpinId] = useState(null);
  const [details, setDetails] = useState(null); // { spinId, game, error }
  const [achievementProgress, setAchievementProgress] = useState(null);
  const [isLoadingAchievements, setIsLoadingAchievements] = useState(false);
  const [achievementError, setAchievementError] = useState(false);
  const [notice, setNotice] = useState(null); // { text, undo? }
  const [history, addToHistory] = useSpinHistory(steamId);

  const genres = useMemo(() => genresOf(games), [games]);
  const filters = { collection, genre, playtimeFilter, duration, hideAdult };

  // Los juegos que pueden salir: exactamente los que cumplen los filtros actuales.
  const pool = useMemo(() => {
    if (!steamId) return DEMO_GAMES;
    return games.filter((game) => matchesFilters(game, filters)).map(toReelGame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steamId, games, collection, genre, playtimeFilter, duration, hideAdult]);

  const isSpinning = spin !== null && settledSpinId !== spin.id;
  const isLoadingDetails = spin !== null && settledSpinId === spin.id && details?.spinId !== spin.id;
  const shownGame = spin && details?.spinId === settledSpinId ? details.game : null;
  const detailsError = spin && details?.spinId === settledSpinId ? details.error : null;
  const unplayedCount = useMemo(() => games.filter((game) => game.playtime_forever_minutes === 0 && !game.is_hidden).length, [games]);
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
    addToHistory(settledWinner);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledWinner?.appid, settledSpinId]);

  useEffect(() => () => applyAccent(null), []);

  function handleSpin({ exclude } = {}) {
    if (isSpinning || libraryLoading) return;
    const candidates = exclude ? pool.filter((game) => game.appid !== exclude) : pool;
    if (candidates.length === 0) {
      setNotice({ text: "No quedan otros juegos con estos filtros." });
      return;
    }
    setNotice(null);
    showGame(candidates[Math.floor(Math.random() * candidates.length)]);
  }

  /** Elegido a mano (panel de abajo o historial): queda en el centro del rodillo sin girar. */
  function handlePick(game) {
    if (isSpinning) return;
    setNotice(null);
    showGame(toReelGame(game), { instant: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showGame(winner, { instant = false } = {}) {
    const spinId = Date.now();
    setSpin({ id: spinId, winner, instant });
    fetchGameDetails({ steamId, friendSteamId, appid: winner.appid })
      .then((game) => setDetails({ spinId, game, error: null }))
      .catch((err) =>
        setDetails({ spinId, game: null, error: err.response?.data?.detail ?? "No se pudo cargar la ficha del juego." }),
      );
  }

  async function handleToggleFavorite(target) {
    if (!isLoggedIn) return;
    const nextValue = !target.is_favorite;
    try {
      if (nextValue) await addFavorite(steamId, target.appid);
      else await removeFavorite(steamId, target.appid);
    } catch {
      return;
    }
    setDetails((current) => (current ? { ...current, game: { ...current.game, is_favorite: nextValue } } : current));
    updateGame(target.appid, { is_favorite: nextValue });
  }

  /** "No me lo muestres más": sale de la ruleta y se gira otra vez. Se puede deshacer. */
  async function handleHide(target) {
    try {
      await hideGame(target.appid);
    } catch {
      setNotice({ text: "No se pudo ocultar el juego. Probá de nuevo." });
      return;
    }
    updateGame(target.appid, { is_hidden: true });
    setSpin(null);
    setDetails(null);
    setNotice({
      text: `Listo: ${target.name} no va a volver a salir. Podés recuperarlo desde Biblioteca → Ocultos.`,
      undo: async () => {
        await unhideGame(target.appid);
        updateGame(target.appid, { is_hidden: false });
        setNotice({ text: `${target.name} vuelve a estar en la ruleta.` });
      },
    });
  }

  let status = null;
  if (libraryLoading) status = <p className="hint roulette__hint">Cargando tu biblioteca…</p>;
  else if (steamId && libraryStatus === "error") status = <p className="error-text roulette__hint">{libraryError}</p>;
  else if (pool.length === 0) status = <p className="hint roulette__hint">{emptyPoolMessage(duration)}</p>;
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
        {games.length > 0 && (
          <dl className="roulette__stats">
            <div>
              <dt>juegos</dt>
              <dd>{games.length.toLocaleString("es-AR")}</dd>
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
        <button type="button" className="button button--primary button--large" onClick={() => handleSpin()} disabled={!canSpin}>
          {isSpinning ? "Girando…" : "Girar la ruleta"}
        </button>

        <div className="segmented" role="group" aria-label="Horas jugadas">
          {PLAYTIME_OPTIONS.filter((option) => steamId || option.id !== "stale").map((option) => (
            <button
              key={option.id}
              type="button"
              title={option.title}
              aria-pressed={playtimeFilter === option.id}
              onClick={() => onPlaytimeFilterChange?.(option.id)}
              disabled={isSpinning}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {steamId && (
        <div className="roulette__filters">
          <div className="segmented" role="group" aria-label="Colección">
            <button type="button" aria-pressed={collection === "all"} onClick={() => setCollection("all")} disabled={isSpinning}>
              Todos
            </button>
            <button type="button" aria-pressed={collection === "favorites"} onClick={() => setCollection("favorites")} disabled={isSpinning}>
              Favoritos
            </button>
          </div>

          <select className="select" value={duration} onChange={(event) => setDuration(event.target.value)} aria-label="Duración" disabled={isSpinning}>
            {DURATION_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>

          {genres.length > 0 && (
            <select className="select" value={genre} onChange={(event) => setGenre(event.target.value)} aria-label="Filtrar por género" disabled={isSpinning}>
              <option value="">Todos los géneros</option>
              {genres.map((genreOption) => (
                <option key={genreOption} value={genreOption}>
                  {genreOption}
                </option>
              ))}
            </select>
          )}

          <div className="roulette__toggles">
            <label className="checkbox">
              <input type="checkbox" checked={hideAdult} onChange={(event) => onHideAdultChange?.(event.target.checked)} disabled={isSpinning} />
              Ocultar +18
            </label>
            {hasFamily && (
              <label className="checkbox">
                <input type="checkbox" checked={includeFamily} onChange={(event) => onIncludeFamilyChange?.(event.target.checked)} disabled={isSpinning} />
                Incluir Familia
              </label>
            )}
          </div>
        </div>
      )}

      {library.classification?.running && (
        <p className="roulette__classifying">
          <span className="roulette__classifying-dot" aria-hidden="true" />
          Completando datos de la biblioteca (género, duración, reseñas): {library.classification.classified.toLocaleString("es-AR")} de{" "}
          {library.classification.total.toLocaleString("es-AR")}. Los filtros se van llenando solos.
        </p>
      )}

      {notice && (
        <p className="roulette__notice" role="status">
          {notice.text}
          {notice.undo && (
            <button type="button" className="text-button" onClick={notice.undo}>
              Deshacer
            </button>
          )}
        </p>
      )}

      {status}

      {history.length > 0 && <SpinHistory items={history} onPick={handlePick} disabled={isSpinning} currentAppid={shownGame?.appid} />}

      {!spin && !libraryLoading && pool.length > 0 && (
        <IdlePanel steamId={steamId} library={games} pool={pool} onPick={handlePick} onLogin={onLogin} />
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
          onSpinAgain={pool.length > 1 ? () => handleSpin({ exclude: shownGame.appid }) : undefined}
          onHide={isLoggedIn ? handleHide : undefined}
        />
      )}
    </section>
  );
}

function emptyPoolMessage(duration) {
  if (duration !== "any") {
    return "No hay juegos con esa duración entre los filtros elegidos. La duración sale de HowLongToBeat: los juegos que todavía no tienen datos no entran.";
  }
  return "No hay juegos que cumplan esos filtros. Probá con otros.";
}

function toReelGame(game) {
  return { appid: game.appid, name: game.name, image: game.image ?? game.header_image };
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
