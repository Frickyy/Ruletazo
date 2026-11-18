import { useEffect, useRef, useState } from "react";
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
  const [spinRequest, setSpinRequest] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const spinningRef = useRef(false);
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

  function handleRequestSpin() {
    if (spinningRef.current) return;
    spinningRef.current = true;
    setIsSpinning(true);
    setActiveView("roulette");
    setSpinRequest((value) => value + 1);
  }

  function handleFilterChange(nextFilter) {
    if (spinningRef.current) return;
    setPlaytimeFilter(nextFilter);
  }

  function handleSpinLoadingChange(loading) {
    setIsSpinning(loading);
    if (!loading) spinningRef.current = false;
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

  return (
    <div className="app-shell modern-shell">
      <nav className="topbar" aria-label="Navegación principal">
        <div className="topbar__left">
          <button type="button" className="brand" onClick={() => setActiveView("roulette")} aria-label="Ir a Ruleta">
            <span className="brand-mark" aria-hidden="true">SR</span>
            <span>Steam <em>Roulette</em></span>
          </button>
          <div className="topbar__links">
            <button type="button" className={activeView === "roulette" ? "nav-link nav-link--active" : "nav-link"} onClick={() => setActiveView("roulette")}>
              Ruleta
            </button>
            <button type="button" className={activeView === "library" ? "nav-link nav-link--active" : "nav-link"} onClick={() => setActiveView("library")}>
              Biblioteca
            </button>
            <button type="button" className={activeView === "family" ? "nav-link nav-link--active" : "nav-link"} onClick={() => setActiveView("family")}>
              Familia
            </button>
          </div>
        </div>

        <div className="topbar__meta">
          {sessionVerified && profile ? (
            <div className="profile-menu-wrap">
              <button
                type="button"
                className="steam-profile"
                onClick={() => setProfileMenuOpen((isOpen) => !isOpen)}
                aria-expanded={profileMenuOpen}
                aria-haspopup="menu"
                title="Abrir menú de perfil"
              >
                <img src={profile.avatar} alt={`Avatar de ${profile.name}`} />
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
            <button type="button" className="ghost-button steam-login-top" onClick={handleSteamLogin}>
              <span className="steam-status-dot" aria-hidden="true" />
              Iniciar sesión con Steam
            </button>
          )}
        </div>
      </nav>

      {authMessage && <p className="auth-message" role="status">{authMessage}</p>}

      <main className="main-panel">
        {activeView === "roulette" && (
          <>
        <section className="hero-section">
          <div className="hero-orb" aria-hidden="true" />
          <button type="button" className="glow-button" onClick={handleRequestSpin} disabled={isSpinning}>
            ¡Sorpréndeme!
          </button>

          <div className="filter-row">
            <button type="button" className={`tag-pill${playtimeFilter === "zero" ? " active" : ""}`} onClick={() => handleFilterChange("zero")} disabled={isSpinning}>
              0 horas
            </button>
            <button type="button" className={`tag-pill${playtimeFilter === "under2" ? " active" : ""}`} onClick={() => handleFilterChange("under2")} disabled={isSpinning}>
              Menos de 2 horas
            </button>
            <button type="button" className={`tag-pill${playtimeFilter === "all" ? " active" : ""}`} onClick={() => handleFilterChange("all")} disabled={isSpinning}>
              Toda la biblioteca
            </button>

            <div className="family-toggle">
              <span>Incluir biblioteca de Familia</span>
              <label className="switch">
                <input type="checkbox" checked={includeFamily} onChange={(event) => setIncludeFamily(event.target.checked)} />
                <span className="slider" />
              </label>
            </div>
          </div>
        </section>

        <div className="content-surface result-surface">
          <RoulettePage steamId={steamId} friendSteamId={includeFamily ? familyIdsStorageValue : ""} playtimeFilter={playtimeFilter} spinRequest={spinRequest} onLoadingChange={handleSpinLoadingChange} />
        </div>

          </>
        )}

        {activeView !== "roulette" && <div className="content-surface">
          {activeView === "library" && (
            <div className="family-inline-control">
              <span>Incluir biblioteca familiar</span>
              <label className="switch">
                <input type="checkbox" checked={includeFamily} onChange={(event) => setIncludeFamily(event.target.checked)} />
                <span className="slider" />
              </label>
              <button type="button" className="family-link" onClick={() => setActiveView("family")}>
                Administrar Familia
              </button>
            </div>
          )}
          {activeView === "library" ? (
            <LibraryPage steamId={steamId} friendSteamId={includeFamily ? familyIdsStorageValue : ""} playtimeFilter={playtimeFilter} />
          ) : activeView === "family" ? (
            <section className="family-page">
              <div>
                <p className="eyebrow">FAMILIA</p>
                <h2>Agregá la biblioteca de tu familia</h2>
                <p>Ingresá la URL de tu/s familiar/es para incluirlo/s en la ruleta.</p>
              </div>
              <div className="family-members">
                {familyIds.map((familyId, index) => {
                  const familyProfile = familyProfiles.find(({ id }) => id === familyId)?.profile;
                  return (
                    <div className="family-member" key={`${index}-${familyId}`}>
                      <SteamIdInput id={`family-${index}`} label={`Familiar ${index + 1}`} placeholder="URL de perfil o SteamID64" value={familyId} onChange={(value) => updateFamilyId(index, value)} />
                      {familyProfile && <div className="family-profile"><img src={familyProfile.avatar} alt={`Avatar de ${familyProfile.name}`} /><span>{familyProfile.name}</span></div>}
                      {familyIds.length > 1 && <button type="button" className="family-remove" onClick={() => removeFamilyId(index)}>Quitar</button>}
                    </div>
                  );
                })}
                {familyIds.length < 5 && <button type="button" className="family-secondary-action" onClick={addFamilyId}>Agregar familiar</button>}
              </div>
              <div className="family-actions">
                <button type="button" className="family-secondary-action" onClick={() => setActiveView("library")}>
                  Ver biblioteca combinada
                </button>
              </div>
            </section>
          ) : null}
        </div>}
      </main>
    </div>
  );
}

export default App;
