import { Suspense, lazy, useEffect, useState } from "react";
import RoulettePage from "./pages/RoulettePage.jsx";

// La ruleta va en el paquete principal; el resto se descarga recién cuando se abre.
const LibraryPage = lazy(() => import("./pages/LibraryPage.jsx"));
const ForumPage = lazy(() => import("./pages/ForumPage.jsx"));
const LegalPage = lazy(() => import("./pages/LegalPage.jsx"));
const ProfilePage = lazy(() => import("./pages/ProfilePage.jsx"));
const RoomPage = lazy(() => import("./pages/RoomPage.jsx"));
import SiteFooter from "./components/SiteFooter.jsx";
import SteamLoginButton from "./components/SteamLoginButton.jsx";
import { fetchPublicConfig } from "./services/profileService.js";
import { createRoom } from "./services/roomService.js";
import SteamIdInput from "./components/SteamIdInput.jsx";
import { fetchSession, fetchSteamProfile, logoutSession } from "./services/gameService.js";
import { useHashRoute } from "./routes.js";
import { setLang, t, tk, useLang } from "./i18n/index.js";
import { useLibrary } from "./services/useLibrary.js";
import "./components/SteamIdInput.css";
import "./App.css";

const FRIEND_STEAM_ID_KEY = "steamRoulette.friendSteamId";
const FAMILY_IDS_KEY = "steamRoulette.familyIds";
// Sin sesión se puede girar con cualquier biblioteca pública pegando el link del perfil.
const GUEST_ID_KEY = "steamRoulette.guestId";
// Claves de la versión anterior (la sesión vivía en localStorage); se limpian al arrancar.
const LEGACY_SESSION_KEYS = ["steamRoulette.steamId", "steamRoulette.verifiedSteamId", "steamRoulette.profile"];

const VIEWS = [
  { id: "roulette", label: tk("Ruleta"), icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM12 3v5.5M12 15.5V21M3 12h5.5M15.5 12H21" },
  { id: "library", label: tk("Biblioteca"), icon: "M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z" },
  { id: "family", label: tk("Familia"), icon: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18.5 14.2A6.5 6.5 0 0 1 21.5 20" },
  { id: "forum", label: tk("Foro"), icon: "M4 5h16v11H9l-5 4z" },
];

function App() {
  // Al cambiar de idioma se vuelve a dibujar toda la página con los textos nuevos.
  const lang = useLang();
  // La sesión la define el backend (cookie firmada); acá solo se refleja lo que devuelve /auth/me.
  const [profile, setProfile] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const steamId = profile?.steam_id ?? "";
  const isLoggedIn = Boolean(steamId);
  const [familyIds, setFamilyIds] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FAMILY_IDS_KEY) ?? "null");
      if (Array.isArray(saved)) return saved.slice(0, 5);
    } catch { /* usa el valor anterior si existía */ }
    const legacyId = localStorage.getItem(FRIEND_STEAM_ID_KEY) ?? "";
    return legacyId ? [legacyId] : [""];
  });
  const [{ view: activeView, forumTarget, profileId, roomCode }, navigate] = useHashRoute();
  const [guestId, setGuestId] = useState(() => readStorage(GUEST_ID_KEY) ?? "");
  const [guestProfile, setGuestProfile] = useState(null);
  const isGuest = sessionChecked && !isLoggedIn && Boolean(guestId);
  // Se espera a saber si hay sesión: si no, quien inició sesión cargaba primero la biblioteca de invitado.
  const librarySteamId = steamId || (isGuest ? guestId : "");

  useEffect(() => {
    if (guestId) writeStorage(GUEST_ID_KEY, guestId);
    else removeStorage(GUEST_ID_KEY);
    setGuestProfile(null);
    if (!guestId) return undefined;
    let cancelled = false;
    fetchSteamProfile(guestId)
      .then((data) => {
        if (!cancelled) setGuestProfile({ name: data.name, avatar: data.avatar });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [guestId]);
  // Configuración pública: links para apoyar, tiendas con afiliados, si hay duración (HLTB).
  const [config, setConfig] = useState(null);
  useEffect(() => {
    fetchPublicConfig().then(setConfig).catch(() => setConfig(null));
  }, []);
  const [authMessage, setAuthMessage] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [includeFamily, setIncludeFamily] = useState(() => localStorage.getItem("steamRoulette.includeFamily") !== "false");
  const [playtimeFilter, setPlaytimeFilter] = useState("all");
  // Ocultar juegos +18: activado por defecto.
  const [hideAdult, setHideAdult] = useState(() => readStorage("steamRoulette.hideAdult") !== "false");

  useEffect(() => {
    LEGACY_SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth_error")) setAuthMessage(t("No se pudo iniciar sesión con Steam. Probá nuevamente."));
    if (params.get("auth_error") || params.get("login")) {
      window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    }
    fetchSession()
      .then((session) => {
        setProfile(session);
        if (session && params.get("login") === "success") setAuthMessage(t("Sesión iniciada como {name}.", { name: session.name }));
      })
      .catch(() => setProfile(null))
      .finally(() => setSessionChecked(true));
  }, []);

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
    writeStorage("steamRoulette.hideAdult", String(hideAdult));
  }, [hideAdult]);

  // Perfiles de la familia (nombre y foto) por ID. Se guardan en este navegador: si Steam no
  // responde en un momento dado (por ejemplo, por exceso de pedidos), se sigue mostrando el último.
  const [familyProfiles, setFamilyProfiles] = useState(() => readFamilyProfiles());
  const [failedProfiles, setFailedProfiles] = useState(() => new Set());
  const onFamilyPage = activeView === "family";

  // Se espera a que se deje de escribir: si no, cada tecla pedía un perfil a la Steam API.
  // También se vuelve a pedir al entrar a Familia, por si la vez anterior Steam no respondió.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const results = await Promise.all(
        familyIdsValue.map((id) => fetchSteamProfile(id).then((profile) => ({ id, profile })).catch(() => ({ id, profile: null }))),
      );
      if (cancelled) return;
      setFamilyProfiles((current) => {
        const next = { ...current };
        for (const { id, profile } of results) {
          if (profile) next[id] = { name: profile.name, avatar: profile.avatar };
        }
        writeFamilyProfiles(next);
        return next;
      });
      setFailedProfiles(new Set(results.filter(({ profile }) => !profile).map(({ id }) => id)));
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [familyIdsStorageValue, onFamilyPage]);

  function updateFamilyId(index, value) {
    setFamilyIds((current) => current.map((id, currentIndex) => currentIndex === index ? value : id));
  }

  function addFamilyId() {
    setFamilyIds((current) => current.length < 5 ? [...current, ""] : current);
  }

  /** Desde un perfil: suma a esa persona a la familia y activa la biblioteca combinada. */
  function addToFamily(steamId) {
    setFamilyIds((current) => {
      const filled = current.filter(Boolean);
      if (filled.includes(steamId) || filled.length >= 5) return current;
      return [...filled, steamId];
    });
    setIncludeFamily(true);
  }

  function openProfile(steamId = null) {
    setProfileMenuOpen(false);
    navigate("profile", null, steamId);
    window.scrollTo({ top: 0 });
  }

  /** Cambios de preferencias del perfil (público, seguir logros) reflejados en la sesión. */
  function handlePreferencesChange(preferences) {
    setProfile((current) => (current ? { ...current, ...preferences } : current));
    // Recién activado el seguimiento de logros: se vuelve a correr la segunda pasada para pedirlos.
    if (preferences.track_achievements && !profile?.track_achievements) library.restartEnrichment();
  }

  /** Arma una sala con los juegos que hoy entran en la ruleta y la abre. */
  async function handleCreateRoom(games) {
    const room = await createRoom(games);
    navigate("room", null, room.code);
    window.scrollTo({ top: 0 });
  }

  function removeFamilyId(index) {
    setFamilyIds((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function handleSteamLogin() {
    const apiUrl = import.meta.env.VITE_API_URL ?? "/api";
    window.location.href = `${apiUrl}/auth/login`;
  }

  async function handleLogout() {
    try {
      await logoutSession();
    } finally {
      setProfile(null);
      setProfileMenuOpen(false);
      setAuthMessage(t("Sesión cerrada."));
    }
  }

  function setActiveView(view) {
    navigate(view);
    window.scrollTo({ top: 0 });
  }

  function openForum(target = null) {
    const onlyTabChanged =
      activeView === "forum" && target?.appid === forumTarget?.appid && !target?.threadId && !forumTarget?.threadId;
    navigate("forum", target);
    if (!onlyTabChanged) window.scrollTo({ top: 0 });
  }

  const friendSteamId = includeFamily ? familyIdsStorageValue : "";
  // Una sola biblioteca para la ruleta y la página Biblioteca (se clasifica sola en segundo plano).
  const library = useLibrary(librarySteamId, friendSteamId);
  const guest = isGuest ? { id: guestId, name: guestProfile?.name ?? "", avatar: guestProfile?.avatar ?? "" } : null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__inner">
          <button type="button" className="brand" onClick={() => setActiveView("roulette")} aria-label={t("Ruletazo, ir a la ruleta")}>
            <BrandMark />
            <span className="brand__name">Ruletazo</span>
          </button>

          <nav className="topbar__nav" aria-label={t("Secciones")}>
            <ul className="topbar__links">
              {VIEWS.map((view) => (
                <li key={view.id}>
                  <button
                    type="button"
                    className="nav-link"
                    aria-current={activeView === view.id ? "page" : undefined}
                    onClick={() => (view.id === "forum" ? openForum(null) : setActiveView(view.id))}
                  >
                    <svg className="nav-link__icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d={view.icon} />
                    </svg>
                    <span>{t(view.label)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div className="topbar__meta">
            <LanguageSwitch lang={lang} />
            <SupportButton links={config?.support_links ?? []} />
            {!sessionChecked ? null : isLoggedIn ? (
              <div className="profile-menu-wrap">
                <button
                  type="button"
                  className="account-button"
                  onClick={() => setProfileMenuOpen((isOpen) => !isOpen)}
                  aria-expanded={profileMenuOpen}
                  aria-haspopup="menu"
                >
                  {profile.avatar && <img src={profile.avatar} alt="" />}
                  <span className="account-button__name">{profile.name}</span>
                  <svg className="account-button__caret" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {profileMenuOpen && (
                  <div className="profile-menu" role="menu">
                    <div className="profile-menu__identity">
                      <strong>{profile.name}</strong>
                      <span>{t("Cuenta de Steam")}</span>
                    </div>
                    <button type="button" className="profile-menu__item" onClick={() => openProfile(null)} role="menuitem">
                      {t("Mi perfil")}
                    </button>
                    <button type="button" className="profile-menu__logout" onClick={handleLogout} role="menuitem">
                      {t("Cerrar sesión")}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <SteamLoginButton onClick={handleSteamLogin} />
            )}
          </div>
        </div>
      </header>

      {authMessage && <p className="auth-message" role="status">{authMessage}</p>}

      <main className="main-panel">
        <Suspense fallback={<p className="hint">{t("Cargando…")}</p>}>
        {activeView === "roulette" && (
          <RoulettePage
            steamId={librarySteamId}
            guest={guest}
            onGuestChange={setGuestId}
            isLoggedIn={isLoggedIn}
            friendSteamId={friendSteamId}
            library={library}
            hideAdult={hideAdult}
            onHideAdultChange={setHideAdult}
            hasFamily={familyIdsValue.length > 0}
            playtimeFilter={playtimeFilter}
            onPlaytimeFilterChange={setPlaytimeFilter}
            includeFamily={includeFamily}
            onIncludeFamilyChange={setIncludeFamily}
            onOpenForum={openForum}
            onLogin={handleSteamLogin}
            trackAchievements={Boolean(profile?.track_achievements)}
            onOpenProfile={() => openProfile(null)}
            hltbEnabled={config?.hltb_enabled === true}
            onCreateRoom={isLoggedIn ? handleCreateRoom : undefined}
          />
        )}

        {activeView === "room" && (
          <RoomPage code={roomCode} viewer={profile} onLogin={handleSteamLogin} onBack={() => setActiveView("roulette")} />
        )}

        {activeView === "forum" && (
          <ForumPage
            target={forumTarget}
            onTargetChange={openForum}
            viewer={profile}
            onLogin={handleSteamLogin}
            onOpenProfile={openProfile}
            affiliateStores={config?.affiliate_stores ?? []}
          />
        )}

        {activeView === "library" && (
          <LibraryPage
            steamId={steamId}
            guest={guest}
            onLogin={handleSteamLogin}
            library={library}
            hideAdult={hideAdult}
            onHideAdultChange={setHideAdult}
            playtimeFilter={playtimeFilter}
            onPlaytimeFilterChange={setPlaytimeFilter}
            includeFamily={includeFamily}
            onIncludeFamilyChange={setIncludeFamily}
            onManageFamily={() => setActiveView("family")}
            hltbEnabled={config?.hltb_enabled === true}
          />
        )}

        {activeView === "profile" && (
          <ProfilePage
            profileId={profileId}
            viewer={profile}
            onLogin={handleSteamLogin}
            onOpenForum={openForum}
            onAddToFamily={addToFamily}
            familyIds={familyIdsValue}
            onPreferencesChange={handlePreferencesChange}
            onDeleted={() => {
              setProfile(null);
              setAuthMessage(t("Borramos todos tus datos y cerramos tu sesión."));
              navigate("roulette");
            }}
          />
        )}

        {(activeView === "privacy" || activeView === "terms") && <LegalPage kind={activeView} config={config} />}

        {activeView === "family" && (
          <section className="family-page">
            <div className="family-page__intro">
              <p className="eyebrow">{t("Familia")}</p>
              <h1>{t("Sumá la biblioteca de tu familia")}</h1>
              <p className="hint">{t("Pegá el link del perfil de Steam o el SteamID64 de hasta 5 familiares. Sus juegos entran en la ruleta y en la biblioteca.")}</p>
            </div>
            <div className="family-members">
              {familyIds.map((familyId, index) => {
                const familyProfile = familyProfiles[familyId];
                const profileFailed = !familyProfile && failedProfiles.has(familyId);
                return (
                  <div className="family-member" key={`${index}-${familyId}`}>
                    <SteamIdInput id={`family-${index}`} label={t("Familiar {n}", { n: index + 1 })} placeholder={t("URL de perfil o SteamID64")} value={familyId} onChange={(value) => updateFamilyId(index, value)} />
                    {familyProfile && (
                      <div className="family-profile">
                        {familyProfile.avatar ? <img src={familyProfile.avatar} alt="" /> : <span className="family-profile__avatar" aria-hidden="true" />}
                        <span>{familyProfile.name}</span>
                      </div>
                    )}
                    {profileFailed && (
                      <p className="family-profile family-profile--missing" role="status">
                        {t("No se encontró el perfil. ¿Está bien escrito y es público?")}
                      </p>
                    )}
                    {familyIds.length > 1 && (
                      <button type="button" className="button family-remove" onClick={() => removeFamilyId(index)}>{t("Quitar")}</button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="family-actions">
              {familyIds.length < 5 && <button type="button" className="button" onClick={addFamilyId}>{t("Agregar familiar")}</button>}
              <button type="button" className="button button--primary" onClick={() => setActiveView("library")}>
                {t("Ver biblioteca combinada")}
              </button>
            </div>
          </section>
        )}
        </Suspense>
      </main>

      <SiteFooter config={config} onNavigate={(view) => setActiveView(view)} />
    </div>
  );
}

const FAMILY_PROFILES_KEY = "steamRoulette.familyProfiles";

function readFamilyProfiles() {
  try {
    const parsed = JSON.parse(readStorage(FAMILY_PROFILES_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeFamilyProfiles(profiles) {
  writeStorage(FAMILY_PROFILES_KEY, JSON.stringify(profiles));
}

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function removeStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* almacenamiento bloqueado */
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* modo privado o almacenamiento bloqueado: solo se pierde la preferencia */
  }
}

/**
 * "Apoyar" en la barra de arriba: con un solo link (SUPPORT_LINKS) lo abre directo; con varios,
 * baja a la sección de apoyo del pie de página para elegir. Sin links configurados no se muestra.
 */
function SupportButton({ links }) {
  if (links.length === 0) return null;
  const single = links.length === 1 ? links[0] : null;
  return (
    <a
      className="support-button"
      href={single ? single.url : "#apoyar"}
      target={single ? "_blank" : undefined}
      rel={single ? "noopener noreferrer" : undefined}
      onClick={
        single
          ? undefined
          : (event) => {
              event.preventDefault();
              document.getElementById("apoyar")?.scrollIntoView({ behavior: "smooth" });
            }
      }
      title={t("Es gratis y sin publicidad: si querés, ayudá a mantenerla")}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
      </svg>
      <span className="support-button__label">{t("Apoyar")}</span>
    </a>
  );
}

/** Español / English: el idioma elegido se recuerda en este navegador. */
function LanguageSwitch({ lang }) {
  return (
    <div className="lang-switch" role="group" aria-label={t("Idioma")}>
      <button type="button" aria-pressed={lang === "es"} onClick={() => setLang("es")} lang="es" title="Español">
        ES
      </button>
      <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")} lang="en" title="English">
        EN
      </button>
    </div>
  );
}

/** Logo: tres portadas de un rodillo, la del centro elegida. */
function BrandMark() {
  return (
    <svg className="brand__mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" className="brand__mark-bg" />
      <rect x="5" y="11" width="5" height="10" rx="1.5" className="brand__mark-side" />
      <rect x="22" y="11" width="5" height="10" rx="1.5" className="brand__mark-side" />
      <rect x="12" y="8" width="8" height="16" rx="2" className="brand__mark-center" />
    </svg>
  );
}

export default App;
