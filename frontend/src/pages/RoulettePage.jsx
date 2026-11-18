import { useEffect, useRef, useState } from "react";
import { useRandomGame } from "../hooks/useRandomGame.js";
import { addFavorite, fetchGenres, fetchLibrary, fetchPlayerAchievements, removeFavorite } from "../services/gameService.js";
import GameCard from "../components/GameCard.jsx";
import "../components/GameCard.css";
import "./RoulettePage.css";

function RoulettePage({ steamId, friendSteamId, playtimeFilter = "all", spinRequest = 0, onGameChange, onAchievementChange, onLoadingChange }) {
  const { game, isLoading, error, spin, setGame } = useRandomGame();
  const [collection, setCollection] = useState("all");
  const [genre, setGenre] = useState("");
  const [genres, setGenres] = useState([]);
  const [achievementProgress, setAchievementProgress] = useState(null);
  const [isLoadingAchievements, setIsLoadingAchievements] = useState(false);
  const [achievementError, setAchievementError] = useState(false);
  const optionsRef = useRef({});
  const [thinkingIndex, setThinkingIndex] = useState(0);
  const [libraryPreview, setLibraryPreview] = useState([]);
  const [thinkingGames, setThinkingGames] = useState(DEMO_THINKING_GAMES);
  const lastSpinRequestRef = useRef(spinRequest);

  optionsRef.current = { steamId, friendSteamId, collection, genre: genre || undefined, playtimeFilter };

  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);

  // Juegos reales de la biblioteca (propia + familia) para la animación de "Buscando".
  // El backend la tiene cacheada, así que este pedido es liviano.
  useEffect(() => {
    if (!steamId) {
      setLibraryPreview([]);
      return undefined;
    }
    let cancelled = false;
    fetchLibrary({ steamId, friendSteamId })
      .then((games) => {
        if (!cancelled) setLibraryPreview(games);
      })
      .catch(() => {
        if (!cancelled) setLibraryPreview([]);
      });
    return () => {
      cancelled = true;
    };
  }, [steamId, friendSteamId]);

  // Al empezar cada giro se arma una tanda nueva, respetando los filtros activos,
  // y se precargan las portadas para que no parpadeen mientras rotan.
  useEffect(() => {
    if (!isLoading) return undefined;
    const nextGames = pickThinkingGames(libraryPreview, optionsRef.current);
    nextGames.forEach(({ image }) => {
      const preload = new Image();
      preload.src = image;
    });
    setThinkingGames(nextGames);
    setThinkingIndex(0);
    const timer = window.setInterval(() => setThinkingIndex((index) => (index + 1) % nextGames.length), 350);
    return () => window.clearInterval(timer);
  }, [isLoading, libraryPreview]);

  useEffect(() => {
    onGameChange?.(game);
  }, [game, onGameChange]);

  useEffect(() => {
    if (!steamId || !game) {
      setAchievementProgress(null);
      setIsLoadingAchievements(false);
      setAchievementError(false);
      onAchievementChange?.(null);
      return;
    }
    setIsLoadingAchievements(true);
    setAchievementError(false);
    fetchPlayerAchievements(steamId, game.appid)
      .then((progress) => {
        setAchievementProgress(progress);
        setIsLoadingAchievements(false);
        onAchievementChange?.(progress);
      })
      .catch(() => {
        setAchievementProgress(null);
        setIsLoadingAchievements(false);
        setAchievementError(true);
        onAchievementChange?.(null);
      });
  }, [steamId, game, onAchievementChange]);

  useEffect(() => {
    if (spinRequest === lastSpinRequestRef.current) return;
    lastSpinRequestRef.current = spinRequest;
    spin(optionsRef.current);
  }, [spinRequest, spin]);

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
    <section className="roulette-page">
      {steamId && (
        <div className="roulette-page__filters">
          <div className="collection-toggle">
            <button type="button" className={collection === "all" ? "active" : ""} onClick={() => setCollection("all")}>
              Todos
            </button>
            <button
              type="button"
              className={collection === "favorites" ? "active" : ""}
              onClick={() => setCollection("favorites")}
            >
              Favoritos
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

      {error && <p className="roulette-page__error">{error}</p>}

      {isLoading && <ThinkingCard game={thinkingGames[thinkingIndex] ?? thinkingGames[0]} />}

      {!error && !game && !isLoading && (
        <p className="roulette-page__hint">
          {steamId
            ? "Presioná el botón para elegir un juego al azar de tu biblioteca de Steam."
            : "Presioná el botón para probar con una biblioteca de ejemplo, o iniciá sesión con Steam para usar la tuya."}
        </p>
      )}

      {game && <GameCard game={game} achievementProgress={achievementProgress} isLoadingAchievements={isLoadingAchievements} achievementError={achievementError} onToggleFavorite={steamId ? handleToggleFavorite : undefined} />}
    </section>
  );
}

const THINKING_BATCH_SIZE = 14;

// Sin sesión iniciada la ruleta usa la biblioteca de ejemplo del backend: se muestran esos mismos juegos.
const DEMO_THINKING_GAMES = [
  { name: "Cyberpunk 2077", image: steamHeader(1091500) },
  { name: "ELDEN RING", image: steamHeader(1245620) },
  { name: "Stardew Valley", image: steamHeader(413150) },
  { name: "Red Dead Redemption 2", image: steamHeader(1174180) },
  { name: "Hades", image: steamHeader(1145360) },
];

function steamHeader(appid) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
}

/** Elige una tanda al azar de la biblioteca, priorizando los juegos que cumplen los filtros del giro. */
function pickThinkingGames(library, { collection, genre, playtimeFilter } = {}) {
  if (library.length === 0) return DEMO_THINKING_GAMES;

  const matching = library.filter((game) => {
    if (collection === "favorites" && !game.is_favorite) return false;
    if (genre && !game.genres.includes(genre)) return false;
    if (playtimeFilter === "zero" && game.playtime_forever_minutes !== 0) return false;
    if (playtimeFilter === "under2" && game.playtime_forever_minutes >= 120) return false;
    return true;
  });
  const pool = matching.length >= 3 ? matching : library;

  const shuffled = [...pool];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled.slice(0, THINKING_BATCH_SIZE).map((game) => ({ name: game.name, image: game.header_image }));
}

function ThinkingCard({ game }) {
  return (
    <article className="thinking-card" aria-live="polite">
      <img src={game.image} alt="" />
      <div>
        <span>Buscando</span>
        <strong>{game.name}</strong>
      </div>
    </article>
  );
}

export default RoulettePage;
