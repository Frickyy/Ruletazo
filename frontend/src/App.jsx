import { useEffect, useState } from "react";
import RoulettePage from "./pages/RoulettePage.jsx";
import LibraryPage from "./pages/LibraryPage.jsx";
import SteamIdInput from "./components/SteamIdInput.jsx";
import "./components/SteamIdInput.css";
import "./App.css";

const STEAM_ID_KEY = "steamRoulette.steamId";
const FRIEND_STEAM_ID_KEY = "steamRoulette.friendSteamId";

function App() {
  const [steamId, setSteamId] = useState(() => localStorage.getItem(STEAM_ID_KEY) ?? "");
  const [friendSteamId, setFriendSteamId] = useState(() => localStorage.getItem(FRIEND_STEAM_ID_KEY) ?? "");
  const [activeView, setActiveView] = useState("roulette");

  // Recuerda ambos SteamID para no tener que volver a tipearlos.
  useEffect(() => {
    localStorage.setItem(STEAM_ID_KEY, steamId);
  }, [steamId]);

  useEffect(() => {
    localStorage.setItem(FRIEND_STEAM_ID_KEY, friendSteamId);
  }, [friendSteamId]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>🎲 Steam Roulette</h1>
        <p>Elegí al azar qué jugar de tu biblioteca de Steam</p>
      </header>

      <div className="steam-ids-row">
        <SteamIdInput id="steamid" label="Tu SteamID" value={steamId} onChange={setSteamId} />
        <SteamIdInput
          id="friend-steamid"
          label="SteamID de tu familia (opcional)"
          placeholder="Para combinar bibliotecas"
          value={friendSteamId}
          onChange={setFriendSteamId}
        />
      </div>

      <nav className="app-nav">
        <button
          type="button"
          className={activeView === "roulette" ? "active" : ""}
          onClick={() => setActiveView("roulette")}
        >
          🎯 Ruleta
        </button>
        <button
          type="button"
          className={activeView === "library" ? "active" : ""}
          onClick={() => setActiveView("library")}
        >
          📚 Mi biblioteca
        </button>
      </nav>

      {activeView === "roulette" ? (
        <RoulettePage steamId={steamId} friendSteamId={friendSteamId} />
      ) : (
        <LibraryPage steamId={steamId} friendSteamId={friendSteamId} />
      )}
    </div>
  );
}

export default App;
