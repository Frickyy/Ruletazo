import { useEffect, useState } from "react";
import RoulettePage from "./pages/RoulettePage.jsx";
import LibraryPage from "./pages/LibraryPage.jsx";
import SteamIdInput from "./components/SteamIdInput.jsx";
import { fetchSteamProfile } from "./services/gameService.js";
import "./components/SteamIdInput.css";
import "./App.css";

const STEAM_ID_KEY = "steamRoulette.steamId";
const FRIEND_STEAM_ID_KEY = "steamRoulette.friendSteamId";
const VERIFIED_STEAM_ID_KEY = "steamRoulette.verifiedSteamId";
const FAMILY_IDS_KEY = "steamRoulette.familyIds";

function App() {
  const [steamId, setSteamId] = useState(() => localStorage.getItem(STEAM_ID_KEY) ?? "");
  const [familyIds, setFamilyIds] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FAMILY_IDS_KEY) ?? "null");
      if (Array.isArray(saved)) return saved.slice(0, 5);
    } catch { /* usa el valor anterior si existía */ }
    const legacyId = localStorage.getItem(FRIEND_STEAM_ID_KEY) ?? "";
    return legacyId ? [legacyId] : [""];
  });
  const [activeView, setActiveView] = useState("roulette");
  const [authMessage, setAuthMessage] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [includeFamily, setIncludeFamily] = useState(() => localStorage.getItem("steamRoulette.includeFamily") !== "false");
  const [playtimeFilter, setPlaytimeFilter] = useState("all");
  const [sessionVerified, setSessionVerified] = useState(() => {
    const savedSteamId = localStorage.getItem(STEAM_ID_KEY) ?? "";
    return savedSteamId !== "" && savedSteamId === localStorage.getItem(VERIFIED_STEAM_ID_KEY);
  });
  const [profile, setProfile] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("steamRoulette.profile") ?? "null");
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const loggedInSteamId = params.get("steamid");
    const authError = params.get("auth_error");

    if (loggedInSteamId) {
      if (/^\d{17}$/.test(loggedInSteamId)) {
        setSteamId(loggedInSteamId);
        setSessionVerified(true);
        localStorage.setItem(VERIFIED_STEAM_ID_KEY, loggedInSteamId);
        setAuthMessage("Sesión verificada con Steam.");
      } else {
        setAuthMessage("Steam devolvió un identificador inválido.");
      }
    } else if (authError) {
      setAuthMessage("No se pudo iniciar sesión con Steam. Probá nuevamente.");
    }

    if (loggedInSteamId || authError || params.get("login")) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STEAM_ID_KEY, steamId);
  }, [steamId]);

  const familyIdsValue = familyIds.filter(Boolean);
  const familyIdsStorageValue = familyIdsValue.join(",");

  useEffect(() => {
    localStorage.setItem(FAMILY_IDS_KEY, JSON.stringify(familyIds));
    localStorage.setItem(FRIEND_STEAM_ID_KEY, familyIdsValue.join(","));
  }, [familyIds, familyIdsStorageValue]);

  useEffect(() => {
    localStorage.setItem("steamRoulette.includeFamily", String(includeFamily));
  }, [includeFamily]);

  useEffect(() => {
    if (!sessionVerified || !steamId) {
      setProfile(null);
      return;
    }
    fetchSteamProfile(steamId)
      .then((nextProfile) => {
        setProfile(nextProfile);
        localStorage.setItem("steamRoulette.profile", JSON.stringify(nextProfile));
      })
      .catch(() => setProfile(null));
  }, [sessionVerified, steamId]);

  const [familyProfiles, setFamilyProfiles] = useState([]);

  useEffect(() => {
    Promise.all(familyIdsValue.map((id) => fetchSteamProfile(id).then((profile) => ({ id, profile })).catch(() => ({ id, profile: null }))))
      .then(setFamilyProfiles);
  }, [familyIdsStorageValue]);

  function updateFamilyId(index, value) {
    setFamilyIds((current) => current.map((id, currentIndex) => currentIndex === index ? value : id));
  }

  function addFamilyId() {
    setFamilyIds((current) => current.length < 5 ? [...current, ""] : current);
  }

  function removeFamilyId(index) {
    setFamilyIds((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function handleSteamLogin() {
    const apiUrl = import.meta.env.VITE_API_URL ?? "/api";
    window.location.href = `${apiUrl}/auth/login`;
  }

  function handleLogout() {
    localStorage.removeItem(STEAM_ID_KEY);
    localStorage.removeItem(VERIFIED_STEAM_ID_KEY);
    localStorage.removeItem("steamRoulette.profile");
    setSteamId("");
    setSessionVerified(false);
    setProfile(null);
    setProfileMenuOpen(false);
    setAuthMessage("Sesión cerrada.");
  }

  const views = [
    { id: "roulette", label: "Ruleta" },
    { id: "library", label: "Biblioteca" },
    { id: "family", label: "Familia" },
  ];
  const friendSteamId = includeFamily ? familyIdsStorageValue : "";

  return (
    <div className="app-shell">
      <header className="topbar">
        <button type="button" className="brand" onClick={() => setActiveView("roulette")} aria-label="Steam Roulette, ir a la ruleta">
          steam<span className="brand__slash">/</span>roulette
        </button>

        <nav className="topbar__links" aria-label="Secciones">
          {views.map((view) => (
            <button
              key={view.id}
              type="button"
              className="nav-link"
              aria-current={activeView === view.id ? "page" : undefined}
              onClick={() => setActiveView(view.id)}
            >
              {view.label}
            </button>
          ))}
        </nav>

        <div className="topbar__meta">
          {sessionVerified && profile ? (
            <div className="profile-menu-wrap">
              <button
                type="button"
                className="button steam-profile"
                onClick={() => setProfileMenuOpen((isOpen) => !isOpen)}
                aria-expanded={profileMenuOpen}
                aria-haspopup="menu"
              >
                <img src={profile.avatar} alt="" />
                <span>{profile.name}</span>
              </button>
              {profileMenuOpen && (
                <div className="profile-menu" role="menu">
                  <div className="profile-menu__identity">
                    <strong>{profile.name}</strong>
                    <span>Cuenta de Steam</span>
                  </div>
                  <button type="button" className="profile-menu__logout" onClick={handleLogout} role="menuitem">
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button type="button" className="button" onClick={handleSteamLogin}>
              Iniciar sesión con Steam
            </button>
          )}
        </div>
      </header>

      {authMessage && <p className="auth-message" role="status">{authMessage}</p>}

      <main className="main-panel">
        {activeView === "roulette" && (
          <RoulettePage
            steamId={steamId}
            friendSteamId={friendSteamId}
            playtimeFilter={playtimeFilter}
            onPlaytimeFilterChange={setPlaytimeFilter}
            includeFamily={includeFamily}
            onIncludeFamilyChange={setIncludeFamily}
          />
        )}

        {activeView === "library" && (
          <LibraryPage
            steamId={steamId}
            friendSteamId={friendSteamId}
            playtimeFilter={playtimeFilter}
            includeFamily={includeFamily}
            onIncludeFamilyChange={setIncludeFamily}
            onManageFamily={() => setActiveView("family")}
          />
        )}

        {activeView === "family" && (
          <section className="family-page">
            <div className="family-page__intro">
              <p className="eyebrow">Familia</p>
              <h1>Sumá la biblioteca de tu familia</h1>
              <p className="hint">Pegá el link del perfil de Steam o el SteamID64 de hasta 5 familiares. Sus juegos entran en la ruleta y en la biblioteca.</p>
            </div>
            <div className="family-members">
              {familyIds.map((familyId, index) => {
                const familyProfile = familyProfiles.find(({ id }) => id === familyId)?.profile;
                return (
                  <div className="family-member" key={`${index}-${familyId}`}>
                    <SteamIdInput id={`family-${index}`} label={`Familiar ${index + 1}`} placeholder="URL de perfil o SteamID64" value={familyId} onChange={(value) => updateFamilyId(index, value)} />
                    {familyProfile && (
                      <div className="family-profile">
                        <img src={familyProfile.avatar} alt="" />
                        <span>{familyProfile.name}</span>
                      </div>
                    )}
                    {familyIds.length > 1 && (
                      <button type="button" className="button family-remove" onClick={() => removeFamilyId(index)}>Quitar</button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="family-actions">
              {familyIds.length < 5 && <button type="button" className="button" onClick={addFamilyId}>Agregar familiar</button>}
              <button type="button" className="button button--primary" onClick={() => setActiveView("library")}>
                Ver biblioteca combinada
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
