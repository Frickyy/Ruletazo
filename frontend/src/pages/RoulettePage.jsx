import { useEffect, useMemo, useState } from "react";
import { useRandomGame } from "../hooks/useRandomGame.js";
import { addFavorite, fetchGenres, fetchLibrary, fetchPlayerAchievements, removeFavorite } from "../services/gameService.js";
import GameCard from "../components/GameCard.jsx";
import Reel from "../components/Reel.jsx";
import "../components/GameCard.css";
import "./RoulettePage.css";

const PLAYTIME_OPTIONS = [
  { id: "all", label: "Toda la biblioteca" },
  { id: "zero", label: "0 horas" },
  { id: "under2", label: "Menos de 2 h" },
];

function RoulettePage({ steamId, friendSteamId, playtimeFilter = "all", onPlaytimeFilterChange, includeFamily, onIncludeFamilyChange }) {
  const { game, isLoading, error, spin, setGame } = useRandomGame();
  const [collection, setCollection] = useState("all");
  const [genre, setGenre] = useState("");
  const [genres, setGenres] = useState([]);
  const [library, setLibrary] = useState([]);
  const [achievementProgress, setAchievementProgress] = useState(null);
  const [isLoadingAchievements, setIsLoadingAchievements] = useState(false);
  const [achievementError, setAchievementError] = useState(false);

  // Biblioteca (propia + familia) para el rodillo y los contadores. El backend la tiene cacheada.
  useEffect(() => {
    if (!steamId) {
      setLibrary([]);
      return undefined;
    }
    let cancelled = false;
    fetchLibrary({ steamId, friendSteamId })
      .then((games) => {
        if (!cancelled) setLibrary(games);
      })
      .catch(() => {
        if (!cancelled) setLibrary([]);
      });
    return () => {
      cancelled = true;
    };
  }, [steamId, friendSteamId]);

  // Los géneros disponibles dependen de cuánto de la biblioteca ya se clasificó.
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

  useEffect(() => {
    if (!steamId || !game) {
      setAchievementProgress(null);
      setIsLoadingAchievements(false);
      setAchievementError(false);
      return;
    }
    setIsLoadingAchievements(true);
    setAchievementError(false);
    fetchPlayerAchievements(steamId, game.appid)
      .then((progress) => {
        setAchievementProgress(progress);
        setIsLoadingAchievements(false);
      })
      .catch(() => {
        setAchievementProgress(null);
        setIsLoadingAchievements(false);
        setAchievementError(true);
      });
  }, [steamId, game]);

  // El rodillo muestra los juegos que cumplen los filtros actuales (o la biblioteca de ejemplo sin sesión).
  const reelPool = useMemo(() => {
    if (library.length === 0) return DEMO_GAMES;
    const matching = library.filter((item) => matchesFilters(item, { collection, genre, playtimeFilter }));
    const source = matching.length >= 3 ? matching : library;
    return source.map((item) => ({ appid: item.appid, name: item.name, image: item.header_image }));
  }, [library, collection, genre, playtimeFilter]);

  const unplayedCount = useMemo(() => library.filter((item) => item.playtime_forever_minutes === 0).length, [library]);

  function handleSpin() {
    if (isLoading) return;
    spin({ steamId, friendSteamId, collection, genre: genre || undefined, playtimeFilter });
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
    <section className="roulette" aria-labelledby="roulette-title">
      <div className="roulette__heading">
        <h1 id="roulette-title">¿Qué jugamos hoy?</h1>
        {library.length > 0 && (
          <p className="roulette__stats">
            {library.length} juegos · {unplayedCount} sin estrenar
          </p>
        )}
      </div>

      <Reel pool={reelPool} result={isLoading ? null : game} isSpinning={isLoading} />

      <div className="roulette__controls">
        <button type="button" className="button button--primary button--large" onClick={handleSpin} disabled={isLoading}>
          {isLoading ? "Girando…" : "Girar la ruleta"}
        </button>

        <div className="segmented" role="group" aria-label="Horas jugadas">
          {PLAYTIME_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={playtimeFilter === option.id}
              onClick={() => onPlaytimeFilterChange?.(option.id)}
              disabled={isLoading}
            >
              {option.label}
            </button>
          ))}
        </div>

        {steamId && (
          <div className="segmented" role="group" aria-label="Colección">
            <button type="button" aria-pressed={collection === "all"} onClick={() => setCollection("all")} disabled={isLoading}>
              Todos
            </button>
            <button type="button" aria-pressed={collection === "favorites"} onClick={() => setCollection("favorites")} disabled={isLoading}>
              Favoritos
            </button>
          </div>
        )}

        {steamId && genres.length > 0 && (
          <select className="select" value={genre} onChange={(event) => setGenre(event.target.value)} aria-label="Filtrar por género" disabled={isLoading}>
            <option value="">Todos los géneros</option>
            {genres.map((genreOption) => (
              <option key={genreOption} value={genreOption}>
                {genreOption}
              </option>
            ))}
          </select>
        )}

        <label className="checkbox roulette__family">
          <input type="checkbox" checked={includeFamily} onChange={(event) => onIncludeFamilyChange?.(event.target.checked)} />
          Incluir biblioteca de Familia
        </label>
      </div>

      {error && <p className="error-text">{error}</p>}

      {!error && !game && !isLoading && (
        <p className="hint roulette__hint">
          {steamId
            ? "Tocá «Girar la ruleta» y te elige un juego de tu biblioteca."
            : "Sin sesión, la ruleta usa una biblioteca de ejemplo. Iniciá sesión con Steam para usar la tuya."}
        </p>
      )}

      {game && !isLoading && (
        <GameCard
          game={game}
          achievementProgress={achievementProgress}
          isLoadingAchievements={isLoadingAchievements}
          achievementError={achievementError}
          onToggleFavorite={steamId ? handleToggleFavorite : undefined}
        />
      )}
    </section>
  );
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

// Sin sesión la ruleta usa la biblioteca de ejemplo del backend: el rodillo muestra esos mismos juegos.
const DEMO_GAMES = [
  { appid: 1091500, name: "Cyberpunk 2077", image: steamHeader(1091500) },
  { appid: 1245620, name: "ELDEN RING", image: steamHeader(1245620) },
  { appid: 413150, name: "Stardew Valley", image: steamHeader(413150) },
  { appid: 1174180, name: "Red Dead Redemption 2", image: steamHeader(1174180) },
  { appid: 1145360, name: "Hades", image: steamHeader(1145360) },
];

export default RoulettePage;
