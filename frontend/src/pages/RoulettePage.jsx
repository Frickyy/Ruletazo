import { useEffect, useRef, useState } from "react";
import { useRandomGame } from "../hooks/useRandomGame.js";
import { addFavorite, fetchGenres, fetchPlayerAchievements, removeFavorite } from "../services/gameService.js";
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
  const lastSpinRequestRef = useRef(spinRequest);

  optionsRef.current = { steamId, friendSteamId, collection, genre: genre || undefined, playtimeFilter };

  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);

  useEffect(() => {
    if (!isLoading) return undefined;
    const timer = window.setInterval(() => setThinkingIndex((index) => (index + 1) % THINKING_GAMES.length), 350);
    return () => window.clearInterval(timer);
  }, [isLoading]);

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

      {isLoading && <ThinkingCard game={THINKING_GAMES[thinkingIndex]} />}

      {!error && !game && !isLoading && (
        <p className="roulette-page__hint">
          {steamId
            ? "Presioná el botón para elegir un juego al azar de tu biblioteca de Steam."
            : "Presioná el botón para probar con la biblioteca de ejemplo, o ingresá tu SteamID arriba."}
        </p>
      )}

      {game && <GameCard game={game} achievementProgress={achievementProgress} isLoadingAchievements={isLoadingAchievements} achievementError={achievementError} onToggleFavorite={steamId ? handleToggleFavorite : undefined} />}
    </section>
  );
}

const THINKING_GAMES = [
  { name: "Buscando en tu biblioteca", image: "https://cdn.cloudflare.steamstatic.com/steam/apps/1091500/header.jpg" },
  { name: "Revisando tus juegos", image: "https://cdn.cloudflare.steamstatic.com/steam/apps/1245620/header.jpg" },
  { name: "Encontrando una sorpresa", image: "https://cdn.cloudflare.steamstatic.com/steam/apps/1145360/header.jpg" },
];

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
