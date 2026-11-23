import { useEffect, useMemo, useState } from "react";
import {
  addFavorite,
  fetchGameDetails,
  fetchPlayerAchievements,
  hideGame,
  removeFavorite,
  setGameState,
  unhideGame,
} from "../services/gameService.js";
import GameCard from "../components/GameCard.jsx";
import IdlePanel from "../components/IdlePanel.jsx";
import SpinHistory, { useSpinHistory } from "../components/SpinHistory.jsx";
import { coverAccent } from "../services/coverColor.js";
import ClassificationBanner from "../components/ClassificationBanner.jsx";
import {
  DURATION_OPTIONS,
  MODE_OPTIONS,
  PLAYTIME_OPTIONS,
  genresOf,
  matchesFilters,
  pickWeighted,
  smartWeight,
} from "../services/libraryFilters.js";
import { unlockAudio } from "../services/reelSound.js";
import Reel from "../components/Reel.jsx";
import { formatNumber, t } from "../i18n/index.js";
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
  guest = null,
  onGuestChange,
  friendSteamId,
  library,
  hideAdult,
  onHideAdultChange,
  hideSoftware = true,
  onHideSoftwareChange,
  hasFamily,
  playtimeFilter = "all",
  onPlaytimeFilterChange,
  includeFamily,
  onIncludeFamilyChange,
  onOpenForum,
  onLogin,
  trackAchievements = false,
  onOpenProfile,
  hltbEnabled = true,
  onCreateRoom,
}) {
  const { games, status: libraryStatus, error: libraryError, updateGame } = library;
  const [collection, setCollection] = useState("all");
  const [genre, setGenre] = useState("");
  const [duration, setDuration] = useState("any");
  const [mode, setMode] = useState("any");
  const [inCommon, setInCommon] = useState(false);
  const [includeFinished, setIncludeFinished] = useState(false);
  const [smart, setSmart] = useStoredFlag("steamRoulette.smart", false);
  const [sound, setSound] = useStoredFlag("steamRoulette.sound", false);
  const [spin, setSpin] = useState(null); // { id, winner, instant }
  const [settledSpinId, setSettledSpinId] = useState(null);
  const [details, setDetails] = useState(null); // { spinId, game, error }
  const [achievementProgress, setAchievementProgress] = useState(null);
  const [isLoadingAchievements, setIsLoadingAchievements] = useState(false);
  const [achievementError, setAchievementError] = useState(false);
  const [notice, setNotice] = useState(null); // { text, undo? }
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [history, addToHistory] = useSpinHistory(steamId);
  // "Otro": el juego que no querías no vuelve a salir hasta que cierres la pestaña.
  const [skipped, setSkipped] = useSessionSet("steamRoulette.skippedToday");

  const genres = useMemo(() => genresOf(games), [games]);
  // La duración sale de HowLongToBeat (si está activado) o de quienes terminaron el juego en
  // Ruletazo. Sin ningún dato todavía, el filtro no se muestra para no dejarlo siempre vacío.
  const durationEnabled = useMemo(() => hltbEnabled || games.some((game) => game.duration_hours != null), [hltbEnabled, games]);
  // "En común" solo tiene sentido con la familia sumada.
  const commonOnly = inCommon && hasFamily && includeFamily;
  const filters = { collection, genre, playtimeFilter, duration, hideAdult, hideSoftware, mode, inCommon: commonOnly, includeFinished };
  const gamesById = useMemo(() => new Map(games.map((game) => [game.appid, game])), [games]);

  // Los juegos que pueden salir: exactamente los que cumplen los filtros actuales.
  const pool = useMemo(() => {
    if (!steamId) return DEMO_GAMES;
    return games.filter((game) => matchesFilters(game, filters)).map(toReelGame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steamId, games, collection, genre, playtimeFilter, duration, hideAdult, hideSoftware, mode, commonOnly, includeFinished]);
  // Los descartados por hoy siguen pasando por el rodillo (si no, la tira se rearmaba de golpe
  // justo al girar), pero no pueden ganar.
  const spinnable = useMemo(() => pool.filter((game) => !skipped.has(game.appid)), [pool, skipped]);

  const isSpinning = spin !== null && settledSpinId !== spin.id;
  const isLoadingDetails = spin !== null && settledSpinId === spin.id && details?.spinId !== spin.id;
  const shownGame = spin && details?.spinId === settledSpinId ? details.game : null;
  // La ficha que se ve: la del juego nuevo apenas está lista; mientras gira y carga, la anterior
  // queda en su lugar (atenuada). Antes se borraba al girar y la página se achicaba y volvía a crecer.
  const [lastCard, setLastCard] = useState(null);
  useEffect(() => {
    if (shownGame) setLastCard(shownGame);
  }, [shownGame]);
  const cardGame = shownGame ?? lastCard;
  const cardIsStale = Boolean(cardGame) && !shownGame;
  const detailsError = spin && details?.spinId === settledSpinId ? details.error : null;
  const unplayedCount = useMemo(() => games.filter((game) => game.playtime_forever_minutes === 0 && !game.is_hidden).length, [games]);
  const libraryLoading = Boolean(steamId) && libraryStatus === "loading";
  const canSpin = !isSpinning && !libraryLoading && spinnable.length > 0;

  useEffect(() => {
    if (!shownGame) return; // girando: se mantienen los del juego anterior hasta tener el nuevo
    // Los logros son los tuyos: un juego que solo tiene un familiar no tiene progreso propio.
    if (!steamId || shownGame.source === "friend") {
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
    const candidates = exclude ? spinnable.filter((game) => game.appid !== exclude.appid) : spinnable;
    if (candidates.length === 0) {
      setNotice({ text: t("No quedan otros juegos con estos filtros.") });
      return;
    }
    setNotice(null);
    if (exclude && steamId) {
      setSkipped((current) => new Set(current).add(exclude.appid));
      setNotice({
        text: t("{name} no vuelve a salir por hoy.", { name: exclude.name }),
        undo: () => {
          setSkipped((current) => {
            const next = new Set(current);
            next.delete(exclude.appid);
            return next;
          });
          setNotice(null);
        },
      });
    }
    unlockAudio();
    // Ruleta inteligente: salen más seguido los sin estrenar, cortos, bien reseñados… (ver smartWeight).
    showGame(pickWeighted(candidates, smart && steamId ? (game) => smartWeight(gamesById.get(game.appid)) : undefined));
  }

  // Barra espaciadora para girar (salvo que se esté escribiendo o haya un botón con foco).
  useEffect(() => {
    function onKeyDown(event) {
      if (event.code !== "Space" || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target.closest?.("input, textarea, select, button, a, [contenteditable='true']")) return;
      event.preventDefault();
      handleSpin();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

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
        setDetails({ spinId, game: null, error: err.response?.data?.detail ?? t("No se pudo cargar la ficha del juego.") }),
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

  /** Jugando / Terminado / Abandonado (o null para quitarlo). */
  async function handleSetState(target, state) {
    try {
      await setGameState(target.appid, state);
    } catch {
      setNotice({ text: t("No se pudo guardar el estado. Probá de nuevo.") });
      return;
    }
    updateGame(target.appid, { state });
    setDetails((current) => (current?.game?.appid === target.appid ? { ...current, game: { ...current.game, state } } : current));
    setLastCard((current) => (current?.appid === target.appid ? { ...current, state } : current));
  }

  /** "No me lo muestres más": sale de la ruleta y se gira otra vez. Se puede deshacer. */
  async function handleHide(target) {
    try {
      await hideGame(target.appid);
    } catch {
      setNotice({ text: t("No se pudo ocultar el juego. Probá de nuevo.") });
      return;
    }
    updateGame(target.appid, { is_hidden: true });
    setSpin(null);
    setDetails(null);
    setLastCard(null);
    setNotice({
      text: t("Listo: {name} no va a volver a salir. Podés recuperarlo desde Biblioteca → Ocultos.", { name: target.name }),
      undo: async () => {
        await unhideGame(target.appid);
        updateGame(target.appid, { is_hidden: false });
        setNotice({ text: t("{name} vuelve a estar en la ruleta.", { name: target.name }) });
      },
    });
  }

  async function handleCreateRoom() {
    setCreatingRoom(true);
    try {
      await onCreateRoom(spinnable);
    } catch (err) {
      setNotice({ text: err.response?.data?.detail ?? t("No se pudo armar la sala. Probá de nuevo.") });
    } finally {
      setCreatingRoom(false);
    }
  }

  let status = null;
  if (libraryLoading) status = <p className="hint roulette__hint">{t("Cargando tu biblioteca…")}</p>;
  else if (steamId && libraryStatus === "error") {
    status = (
      <p className="error-text roulette__hint">
        {libraryError}
        {guest && (
          <>
            {" "}
            <button type="button" className="text-button" onClick={() => onGuestChange?.("")}>
              {t("Probar con otro perfil")}
            </button>
          </>
        )}
      </p>
    );
  }
  // Solo si no hay nada que girar: si ya hay progreso guardado, la ruleta funciona igual.
  else if (collection === "near_complete" && !trackAchievements && pool.length === 0) {
    status = (
      <p className="hint roulette__hint">
        {t("“Casi al 100%” usa tu progreso de logros, que solo se pide a Steam si lo activás.")}{" "}
        <button type="button" className="text-button" onClick={onOpenProfile}>
          {t("Activarlo en tu perfil")}
        </button>
      </p>
    );
  } else if (pool.length > 0 && spinnable.length === 0) {
    status = (
      <p className="hint roulette__hint">
        {t("Ya descartaste todos los juegos que cumplen estos filtros.")}{" "}
        <button type="button" className="text-button" onClick={() => setSkipped(new Set())}>
          {t("Volver a incluirlos")}
        </button>
      </p>
    );
  } else if (pool.length === 0) status = <p className="hint roulette__hint">{emptyPoolMessage(duration)}</p>;
  else if (isLoadingDetails && !lastCard) status = <p className="hint roulette__hint">{t("Cargando la ficha de {name}…", { name: spin.winner.name })}</p>;
  else if (detailsError) status = <p className="error-text roulette__hint">{detailsError}</p>;

  return (
    <section className="roulette" aria-labelledby="roulette-title">
      <header className="roulette__hero">
        <div className="roulette__title">
          <p className="eyebrow">
            {guest
              ? t("La biblioteca de {name}, a la suerte", { name: guest.name || t("este perfil") })
              : steamId
                ? t("Tu biblioteca, a la suerte")
                : t("Biblioteca de ejemplo")}
          </p>
          <h1 id="roulette-title">{t("¿Qué jugamos hoy?")}</h1>
          <p className="roulette__lead">
            {steamId
              ? t("Girá la ruleta: el juego que frene en el centro es el que te toca.")
              : t("Probá la ruleta con {count} juegos de ejemplo, o pegá el link de tu perfil de Steam para girar con tu biblioteca.", { count: DEMO_GAMES.length })}
          </p>
        </div>
        {games.length > 0 && (
          <dl className="roulette__stats">
            <div>
              <dt>{t("juegos")}</dt>
              <dd>{formatNumber(games.length)}</dd>
            </div>
            <div>
              <dt>{t("sin estrenar")}</dt>
              <dd>{formatNumber(unplayedCount)}</dd>
            </div>
            <div className="roulette__stat--accent">
              <dt>{t("en la ruleta")}</dt>
              <dd>{formatNumber(pool.length)}</dd>
            </div>
          </dl>
        )}
      </header>

      <Reel pool={pool} spin={spin} onSettled={() => setSettledSpinId(spin?.id)} sound={sound} />
      <p className="visually-hidden" aria-live="polite">
        {isSpinning ? t("Girando la ruleta…") : shownGame ? t("Te tocó {name}", { name: shownGame.name }) : ""}
      </p>

      {/* Controles en una grilla de 4 columnas, todo al mismo alto:
          fila 1: girar | horas jugadas (2) | género — fila 2: colección (2) | modo | duración — fila 3: opciones. */}
      <div className={`roulette__panel${steamId ? "" : " roulette__panel--demo"}`}>
        <div className="roulette__spin-group">
          <button
            type="button"
            className="button button--primary roulette__spin"
            onClick={() => handleSpin()}
            disabled={!canSpin}
            aria-keyshortcuts="Space"
            title={t("También con la barra espaciadora")}
          >
            {isSpinning ? t("Girando…") : t("Girar la ruleta")}
            <kbd className="roulette__kbd" aria-hidden="true">{t("espacio")}</kbd>
          </button>
          <button
            type="button"
            className="button roulette__sound"
            aria-pressed={sound}
            onClick={() => {
              unlockAudio();
              setSound(!sound);
            }}
            title={sound ? t("Silenciar el rodillo") : t("Activar el sonido del rodillo")}
            aria-label={sound ? t("Silenciar el rodillo") : t("Activar el sonido del rodillo")}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
              {sound ? <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /> : <path d="m16 9.5 5 5M21 9.5l-5 5" />}
            </svg>
          </button>
        </div>

        <div className="segmented roulette__wide" role="group" aria-label={t("Horas jugadas")}>
          {PLAYTIME_OPTIONS.filter((option) => steamId || option.id !== "stale").map((option) => (
            <button
              key={option.id}
              type="button"
              title={option.title ? t(option.title) : undefined}
              aria-pressed={playtimeFilter === option.id}
              onClick={() => onPlaytimeFilterChange?.(option.id)}
              disabled={isSpinning}
            >
              {t(option.label)}
            </button>
          ))}
        </div>

        {steamId && (
          <>
            {guest ? (
              <GuestBar guest={guest} onChange={() => onGuestChange?.("")} onLogin={onLogin} />
            ) : (
            <div className="segmented roulette__collection" role="group" aria-label={t("Colección")}>
              <button type="button" aria-pressed={collection === "all"} onClick={() => setCollection("all")} disabled={isSpinning}>
                {t("Todos")}
              </button>
              <button type="button" aria-pressed={collection === "favorites"} onClick={() => setCollection("favorites")} disabled={isSpinning}>
                {t("Favoritos")}
              </button>
              <button type="button" aria-pressed={collection === "playing"} onClick={() => setCollection("playing")} disabled={isSpinning}>
                {t("Jugando")}
              </button>
              <button
                type="button"
                aria-pressed={collection === "near_complete"}
                onClick={() => setCollection("near_complete")}
                disabled={isSpinning}
                title={t("Te falta poco para tener todos los logros (80% o más)")}
              >
                {t("Casi al 100%")}
              </button>
            </div>
            )}

            <select
              className={`select${durationEnabled ? "" : " roulette__mode--wide"}`}
              value={mode}
              onChange={(event) => setMode(event.target.value)}
              aria-label={t("Modo de juego")}
              disabled={isSpinning}
            >
              {MODE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {t(option.label)}
                </option>
              ))}
            </select>

            {durationEnabled && (
              <select className="select" value={duration} onChange={(event) => setDuration(event.target.value)} aria-label={t("Duración")} disabled={isSpinning}>
                {DURATION_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}

            {/* Siempre presente (aunque todavía no haya géneros) para que la grilla no quede con un hueco. */}
            <select
              className="select roulette__genre"
              value={genre}
              onChange={(event) => setGenre(event.target.value)}
              aria-label={t("Filtrar por género")}
              disabled={isSpinning || genres.length === 0}
            >
              <option value="">{genres.length ? t("Todos los géneros") : t("Géneros: cargando…")}</option>
              {genres.map((genreOption) => (
                <option key={genreOption} value={genreOption}>
                  {t(genreOption)}
                </option>
              ))}
            </select>

            <div className="roulette__toggles" role="group" aria-label={t("Opciones")}>
              <Toggle checked={hideAdult} onChange={onHideAdultChange} disabled={isSpinning} label={t("Ocultar +18")} />
              <Toggle
                checked={hideSoftware}
                onChange={onHideSoftwareChange}
                disabled={isSpinning}
                label={t("Ocultar programas")}
                title={t("Deja afuera lo que Steam lista como software, como Soundpad o Wallpaper Engine")}
              />
              {isLoggedIn && (
                <Toggle
                  checked={includeFinished}
                  onChange={setIncludeFinished}
                  disabled={isSpinning}
                  label={t("Incluir terminados")}
                  title={t("Por defecto los juegos marcados como terminados no salen")}
                />
              )}
              {hasFamily && <Toggle checked={includeFamily} onChange={onIncludeFamilyChange} disabled={isSpinning} label={t("Incluir Familia")} />}
              {hasFamily && includeFamily && (
                <Toggle
                  checked={inCommon}
                  onChange={setInCommon}
                  disabled={isSpinning}
                  label={t("En común con la familia")}
                  title={t("Solo los juegos que tenés vos y alguien de tu familia: para jugar juntos")}
                />
              )}
              <Toggle
                checked={smart}
                onChange={setSmart}
                disabled={isSpinning}
                label={t("Ruleta inteligente")}
                title={t("Salen más seguido los sin estrenar, los cortos, los bien reseñados, tus favoritos y los que estás jugando")}
              />
              {onCreateRoom && (
                <button
                  type="button"
                  className="toggle toggle--action"
                  onClick={handleCreateRoom}
                  disabled={isSpinning || creatingRoom || spinnable.length < 2}
                  title={t("Armá una sala con estos juegos: tus amigos entran con un link, vetan y la ruleta gira para todos")}
                >
                  {creatingRoom ? t("Armando sala…") : t("Ruleta grupal")}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {steamId && <ClassificationBanner classification={library.classification} onPause={library.setClassificationPaused} />}

      {notice && (
        <p className="roulette__notice" role="status">
          {notice.text}
          {notice.undo && (
            <button type="button" className="text-button" onClick={notice.undo}>
              {t("Deshacer")}
            </button>
          )}
        </p>
      )}

      {status}

      {history.length > 0 && <SpinHistory items={history} onPick={handlePick} disabled={isSpinning} currentAppid={shownGame?.appid} />}

      {/* Se queda hasta que llega la primera ficha, para que la página no se achique mientras gira. */}
      {!cardGame && !libraryLoading && pool.length > 0 && (
        <IdlePanel
          steamId={steamId}
          library={games}
          pool={pool}
          onPick={handlePick}
          onLogin={onLogin}
          onGuest={onGuestChange}
          isStale={Boolean(spin)}
        />
      )}

      {cardGame && (
        <GameCard
          game={cardGame}
          isStale={cardIsStale}
          achievementProgress={achievementProgress}
          isLoadingAchievements={isLoadingAchievements}
          achievementError={achievementError}
          isDemo={!steamId}
          onToggleFavorite={isLoggedIn ? handleToggleFavorite : undefined}
          onOpenForum={onOpenForum}
          onSpinAgain={spinnable.length > 1 ? () => handleSpin({ exclude: cardGame }) : undefined}
          onHide={isLoggedIn ? handleHide : undefined}
          onSetState={isLoggedIn ? handleSetState : undefined}
        />
      )}
    </section>
  );
}

/** Sin sesión, girando con una biblioteca pública: de quién es, cambiarla o iniciar sesión. */
function GuestBar({ guest, onChange, onLogin }) {
  return (
    <div className="roulette__collection roulette__guest" role="group" aria-label={t("Biblioteca en uso")}>
      {guest.avatar ? <img src={guest.avatar} alt="" /> : <span className="roulette__guest-avatar" aria-hidden="true" />}
      <span className="roulette__guest-name">{guest.name || t("Perfil de Steam")}</span>
      <button type="button" className="text-button" onClick={onChange}>
        {t("Cambiar")}
      </button>
      <button type="button" className="text-button" onClick={onLogin} title={t("Para guardar favoritos, estados y ocultos")}>
        {t("Iniciar sesión")}
      </button>
    </div>
  );
}

/** Opción on/off con forma de botón: todas del mismo ancho en la fila de opciones. */
function Toggle({ checked, onChange, disabled, label, title }) {
  return (
    <label className={`toggle${checked ? " toggle--on" : ""}`} title={title}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange?.(event.target.checked)} disabled={disabled} />
      <span>{label}</span>
    </label>
  );
}

/** Conjunto de appids que dura lo que dura la pestaña (sessionStorage). */
function useSessionSet(key) {
  const [value, setValue] = useState(() => {
    try {
      return new Set(JSON.parse(sessionStorage.getItem(key) ?? "[]"));
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify([...value]));
    } catch {
      /* almacenamiento bloqueado: dura mientras la página esté abierta */
    }
  }, [key, value]);
  return [value, setValue];
}

/** Preferencia guardada en este navegador (true/false). */
function useStoredFlag(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored === null ? initial : stored === "true";
    } catch {
      return initial;
    }
  });
  const update = (next) => {
    setValue(next);
    try {
      localStorage.setItem(key, String(next));
    } catch {
      /* almacenamiento bloqueado: la preferencia dura mientras la página esté abierta */
    }
  };
  return [value, update];
}

function emptyPoolMessage(duration) {
  if (duration !== "any") {
    return t("No hay juegos con esa duración entre los filtros elegidos. Los juegos que todavía no tienen duración no entran.");
  }
  return t("No hay juegos que cumplan esos filtros. Probá con otros.");
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
// Biblioteca de ejemplo para quien entra sin cuenta: variada (cortos, cooperativos, indies y grandes)
// para que el rodillo se vea lleno y la primera prueba ya sirva.
const DEMO_GAMES = [
  { appid: 1091500, name: "Cyberpunk 2077", image: steamHeader(1091500) },
  { appid: 1245620, name: "ELDEN RING", image: steamHeader(1245620) },
  { appid: 413150, name: "Stardew Valley", image: steamHeader(413150) },
  { appid: 1174180, name: "Red Dead Redemption 2", image: steamHeader(1174180) },
  { appid: 1145360, name: "Hades", image: steamHeader(1145360) },
  { appid: 367520, name: "Hollow Knight", image: steamHeader(367520) },
  { appid: 504230, name: "Celeste", image: steamHeader(504230) },
  { appid: 105600, name: "Terraria", image: steamHeader(105600) },
  { appid: 620, name: "Portal 2", image: steamHeader(620) },
  { appid: 220, name: "Half-Life 2", image: steamHeader(220) },
  { appid: 292030, name: "The Witcher 3: Wild Hunt", image: steamHeader(292030) },
  { appid: 1086940, name: "Baldur's Gate 3", image: steamHeader(1086940) },
  { appid: 632470, name: "Disco Elysium", image: steamHeader(632470) },
  { appid: 753640, name: "Outer Wilds", image: steamHeader(753640) },
  { appid: 304430, name: "INSIDE", image: steamHeader(304430) },
  { appid: 1426210, name: "It Takes Two", image: steamHeader(1426210) },
  { appid: 548430, name: "Deep Rock Galactic", image: steamHeader(548430) },
  { appid: 892970, name: "Valheim", image: steamHeader(892970) },
  { appid: 550, name: "Left 4 Dead 2", image: steamHeader(550) },
  { appid: 264710, name: "Subnautica", image: steamHeader(264710) },
  { appid: 646570, name: "Slay the Spire", image: steamHeader(646570) },
  { appid: 588650, name: "Dead Cells", image: steamHeader(588650) },
  { appid: 268910, name: "Cuphead", image: steamHeader(268910) },
  { appid: 391540, name: "Undertale", image: steamHeader(391540) },
  { appid: 1092790, name: "Inscryption", image: steamHeader(1092790) },
  { appid: 1794680, name: "Vampire Survivors", image: steamHeader(1794680) },
  { appid: 2379780, name: "Balatro", image: steamHeader(2379780) },
  { appid: 1966720, name: "Lethal Company", image: steamHeader(1966720) },
  { appid: 814380, name: "Sekiro: Shadows Die Twice", image: steamHeader(814380) },
  { appid: 782330, name: "DOOM Eternal", image: steamHeader(782330) },
  { appid: 489830, name: "The Elder Scrolls V: Skyrim Special Edition", image: steamHeader(489830) },
  { appid: 1687950, name: "Persona 5 Royal", image: steamHeader(1687950) },
  { appid: 1055540, name: "A Short Hike", image: steamHeader(1055540) },
  { appid: 1135690, name: "Unpacking", image: steamHeader(1135690) },
  { appid: 383870, name: "Firewatch", image: steamHeader(383870) },
  { appid: 501300, name: "What Remains of Edith Finch", image: steamHeader(501300) },
  { appid: 653530, name: "Return of the Obra Dinn", image: steamHeader(653530) },
  { appid: 427520, name: "Factorio", image: steamHeader(427520) },
  { appid: 632360, name: "Risk of Rain 2", image: steamHeader(632360) },
  { appid: 728880, name: "Overcooked! 2", image: steamHeader(728880) },
];

export default RoulettePage;
