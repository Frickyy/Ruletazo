import { useEffect, useMemo, useState } from "react";
import { deleteMyData, fetchGamesInCommon, fetchProfile, updateMyPreferences } from "../services/profileService.js";
import SteamLoginButton from "../components/SteamLoginButton.jsx";
import { MODE_OPTIONS, matchesFilters } from "../services/libraryFilters.js";
import SupporterBadge from "../components/SupporterBadge.jsx";
import { shareYearCard } from "../services/yearCard.js";
import { formatNumber, t, tk } from "../i18n/index.js";
import { buildPath } from "../routes.js";
import { usePageTitle } from "../services/pageTitle.js";
import "./ProfilePage.css";

/**
 * Perfil: qué está jugando, qué terminó, favoritos y reseñas del foro.
 * Público por defecto (como en Steam); el dueño lo puede hacer privado.
 * En el perfil de otra persona: "¿Qué tenemos en común?" para elegir qué jugar juntos.
 */
/** ¿Este identificador de la familia (SteamID64, vanity o link) apunta a este perfil? */
export function familyIdMatches(rawId, profile) {
  const id = String(rawId ?? "").trim().replace(/\/+$/, "");
  if (!id) return false;
  if (id === profile.steam_id || id.endsWith(`/profiles/${profile.steam_id}`)) return true;
  const vanity = profile.vanity?.toLowerCase();
  if (!vanity) return false;
  const last = id.split("/").pop().toLowerCase();
  return last === vanity;
}

const MONTHS = [
  tk("enero"), tk("febrero"), tk("marzo"), tk("abril"), tk("mayo"), tk("junio"),
  tk("julio"), tk("agosto"), tk("septiembre"), tk("octubre"), tk("noviembre"), tk("diciembre"),
];

/** Pila de pendientes y desafíos del mes (se calculan en el backend con los estados marcados). */
function Challenges({ challenges, backlog, isMe }) {
  const done = challenges.items.filter((item) => item.progress >= item.goal).length;
  return (
    <section className="profile-section" aria-labelledby="profile-challenges">
      <div className="profile-section__heading">
        <h2 id="profile-challenges">{t("Desafíos de {month}", { month: t(MONTHS[challenges.month - 1]) })}</h2>
        <span className="muted mono">
          {t("{done} de {total} cumplidos", { done, total: challenges.items.length })}
        </span>
      </div>
      <ul className="challenges">
        {backlog && (
          <li className="challenge challenge--backlog">
            <strong>{t("Pila de pendientes")}</strong>
            <span className="challenge__number">{formatNumber(backlog.unplayed)}</span>
            <small>
              {backlog.total > 0
                ? t("juegos sin estrenar ({percent}% de la biblioteca)", { percent: Math.round((backlog.unplayed / backlog.total) * 100) })
                : t("Todavía no hay biblioteca cargada.")}
            </small>
          </li>
        )}
        {challenges.items.map((item) => {
          const complete = item.progress >= item.goal;
          return (
            <li key={item.id} className={`challenge${complete ? " challenge--done" : ""}`}>
              <strong>
                {complete && <span aria-hidden="true">✓ </span>}
                {t(item.title)}
              </strong>
              <small>{t(item.description)}</small>
              <span className="challenge__bar" role="progressbar" aria-valuemin={0} aria-valuemax={item.goal} aria-valuenow={item.progress} aria-label={t(item.title)}>
                <span style={{ width: `${(item.progress / item.goal) * 100}%` }} />
              </span>
              <span className="challenge__count mono">
                {item.progress} / {item.goal}
              </span>
            </li>
          );
        })}
      </ul>
      {isMe && <p className="hint">{t("Se renuevan el primer día de cada mes. Para avanzar, marcá tus juegos como “Jugando” o “Terminado” desde la ficha de la ruleta.")}</p>}
    </section>
  );
}

function ProfilePage({ profileId, viewer, onLogin, onOpenForum, onAddToFamily, familyIds = [], onPreferencesChange, onDeleted }) {
  const targetId = profileId || viewer?.steam_id || null;
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [copied, setCopied] = useState(false);
  const [sharingYear, setSharingYear] = useState(false);

  useEffect(() => {
    if (!targetId) return;
    let cancelled = false;
    setProfile(null);
    setError("");
    fetchProfile(targetId)
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.detail ?? t("No se pudo cargar el perfil."));
      });
    return () => {
      cancelled = true;
    };
  }, [targetId, viewer?.steam_id]);

  // Tu perfil, o el nombre de la otra persona cuando llega.
  usePageTitle(profile ? (profile.is_me ? t("Mi perfil") : profile.name) : profileId ? t("Perfil") : t("Mi perfil"));

  if (!targetId) {
    return (
      <section className="profile-page">
        <h1>{t("Tu perfil")}</h1>
        <p className="hint">{t("Iniciá sesión con Steam para ver y armar tu perfil.")}</p>
        <SteamLoginButton onClick={onLogin} className="profile-page__login" />
      </section>
    );
  }
  if (error) {
    return (
      <section className="profile-page">
        <h1>{t("Perfil")}</h1>
        <p className="hint">{error}</p>
      </section>
    );
  }
  if (!profile) return <p className="hint">{t("Cargando perfil…")}</p>;

  async function savePreference(patch) {
    setSaving(true);
    setSaveError("");
    try {
      const preferences = await updateMyPreferences(patch);
      setProfile((current) => ({ ...current, is_public: preferences.is_public, preferences }));
      onPreferencesChange?.(preferences);
    } catch (err) {
      setSaveError(err.response?.data?.detail ?? t("No se pudo guardar el cambio. Probá de nuevo."));
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    const url = `${window.location.origin}${buildPath("profile", null, profile.steam_id)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t("Copiá el link de tu perfil:"), url);
    }
  }

  const { summary } = profile;
  // La familia puede tener SteamID64, vanity names o links: se compara contra todos.
  const isFamily = familyIds.some((id) => familyIdMatches(id, profile));

  return (
    <section className="profile-page" aria-labelledby="profile-title">
      <header className="profile-hero">
        {profile.avatar ? <img className="profile-hero__avatar" src={profile.avatar} alt="" /> : <span className="profile-hero__avatar" aria-hidden="true" />}
        <div className="profile-hero__info">
          <p className="eyebrow">{profile.is_me ? t("Tu perfil") : t("Perfil")}</p>
          <h1 id="profile-title">
            {profile.name}
            {profile.is_supporter && <SupporterBadge />}
          </h1>
          <p className="profile-hero__meta">
            <span className={`tag${profile.is_public ? " tag--public" : ""}`}>{profile.is_public ? t("Público") : t("Privado")}</span>
            <span>{t("{count} juegos en la biblioteca", { count: formatNumber(profile.library_size) })}</span>
          </p>
        </div>
        <div className="profile-hero__actions">
          {profile.is_me && (
            <button
              type="button"
              className="button"
              disabled={sharingYear}
              onClick={async () => {
                setSharingYear(true);
                try {
                  await shareYearCard(profile);
                } catch {
                  setSaveError(t("No se pudo generar la imagen. Probá de nuevo."));
                } finally {
                  setSharingYear(false);
                }
              }}
            >
              {sharingYear ? t("Generando imagen…") : t("Compartir mi {year}", { year: summary.year })}
            </button>
          )}
          {profile.is_me && profile.is_public && (
            <button type="button" className="button" onClick={copyLink}>
              {copied ? t("¡Link copiado!") : t("Copiar link del perfil")}
            </button>
          )}
          {!profile.is_me && viewer && !isFamily && (
            <button type="button" className="button" onClick={() => onAddToFamily?.(profile.steam_id)} disabled={familyIds.filter(Boolean).length >= 5}>
              {t("Sumar a mi familia")}
            </button>
          )}
          {!profile.is_me && isFamily && <span className="tag">{t("En tu familia")}</span>}
        </div>
      </header>

      {profile.is_me && (
        <section className="profile-settings" aria-label={t("Preferencias del perfil")}>
          <label className="profile-settings__item">
            <input type="checkbox" checked={profile.preferences.is_public} disabled={saving} onChange={(event) => savePreference({ is_public: event.target.checked })} />
            <span>
              <strong>{t("Perfil público")}</strong>
              <small>{t("Cualquiera con el link ve lo que estás jugando, lo que terminaste, tus favoritos y tus reseñas. Tu biblioteca completa no se muestra.")}</small>
            </span>
          </label>
          <label className="profile-settings__item">
            <input
              type="checkbox"
              checked={profile.preferences.track_achievements}
              disabled={saving}
              onChange={(event) => savePreference({ track_achievements: event.target.checked })}
            />
            <span>
              <strong>{t("Seguir mi progreso de logros")}</strong>
              <small>{t("Consulta a Steam cuántos logros tenés en cada juego que jugaste, para el filtro “Casi al 100%”. Necesita que tus logros sean públicos en Steam.")}</small>
            </span>
          </label>
          {saveError && (
            <p className="error-text profile-settings__error" role="alert">
              {saveError}
            </p>
          )}
        </section>
      )}

      <dl className="profile-stats">
        <div>
          <dt>{t("Jugando")}</dt>
          <dd>{summary.counts.playing}</dd>
        </div>
        <div>
          <dt>{t("Terminados")}</dt>
          <dd>{summary.counts.finished}</dd>
        </div>
        <div>
          <dt>{t("Abandonados")}</dt>
          <dd>{summary.counts.abandoned}</dd>
        </div>
        <div className="profile-stats__accent">
          <dt>{t("Terminados en {year}", { year: summary.year })}</dt>
          <dd>{summary.finished_this_year}</dd>
        </div>
      </dl>

      {profile.challenges && <Challenges challenges={profile.challenges} backlog={profile.backlog} isMe={profile.is_me} />}

      <GameShelf
        title={t("Jugando ahora")}
        games={profile.playing}
        empty={profile.is_me ? t("Marcá un juego como “Jugando” desde la ficha de la ruleta.") : t("No está jugando nada por ahora.")}
      />
      <GameShelf
        title={t("Terminados")}
        games={profile.finished}
        empty={profile.is_me ? t("Cuando termines un juego, marcalo como “Terminado”.") : t("Todavía no marcó juegos como terminados.")}
      />
      <GameShelf title={t("Favoritos")} games={profile.favorites} empty={t("Sin favoritos todavía.")} />

      <section className="profile-section" aria-labelledby="profile-reviews">
        <h2 id="profile-reviews">{t("Reseñas en el foro")}</h2>
        {profile.reviews.length === 0 ? (
          <p className="hint">{t("Todavía no escribió reseñas.")}</p>
        ) : (
          <ul className="profile-reviews">
            {profile.reviews.map((review) => (
              <li key={review.id}>
                <button type="button" className="profile-review" onClick={() => onOpenForum?.({ appid: review.appid, name: review.game_name, tab: "reviews" })}>
                  <span className="score-badge" aria-label={t("Puntaje {score} de 10", { score: review.score })}>{review.score}</span>
                  <span className="profile-review__text">
                    <strong>{review.game_name}</strong>
                    <span className="muted">{review.excerpt}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!profile.is_me && viewer && <GamesInCommon steamId={profile.steam_id} name={profile.name} />}
      {!profile.is_me && !viewer && (
        <p className="hint">
          <button type="button" className="text-button" onClick={onLogin}>{t("Iniciá sesión")}</button> {t("para ver qué juegos tienen en común.")}
        </p>
      )}
      {profile.is_me && !profile.is_public && (
        <p className="hint">{t("Tu perfil es privado: solo lo ves vos. Activá “Perfil público” para compartirlo.")}</p>
      )}
      {profile.is_me && <DeleteData onDeleted={onDeleted} />}
    </section>
  );
}

/** Borra todos tus datos de la página (pide confirmación escribiendo BORRAR). */
function DeleteData({ onDeleted }) {
  const [confirming, setConfirming] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(event) {
    event.preventDefault();
    setDeleting(true);
    setError("");
    try {
      await deleteMyData();
      onDeleted?.();
    } catch (err) {
      setError(err.response?.data?.detail ?? t("No se pudieron borrar los datos. Probá de nuevo."));
      setDeleting(false);
    }
  }

  return (
    <section className="profile-section profile-danger" aria-labelledby="profile-danger">
      <h2 id="profile-danger">{t("Borrar mis datos")}</h2>
      <p className="hint">
        {t("Elimina tu perfil, favoritos, ocultos, estados, progreso de logros, la copia de tu biblioteca y tus mensajes del foro, y cierra tu sesión. No se puede deshacer.")}
      </p>
      {!confirming ? (
        <button type="button" className="button profile-danger__button" onClick={() => setConfirming(true)}>
          {t("Borrar mis datos…")}
        </button>
      ) : (
        <form className="profile-danger__form" onSubmit={handleDelete}>
          <label>
            {t("Escribí")} <strong>{t("BORRAR")}</strong> {t("para confirmar")}
            <input className="text-input" value={text} onChange={(event) => setText(event.target.value)} autoComplete="off" />
          </label>
          <div className="profile-danger__actions">
            <button type="submit" className="button profile-danger__button" disabled={text.trim().toUpperCase() !== t("BORRAR") || deleting}>
              {deleting ? t("Borrando…") : t("Borrar todo")}
            </button>
            <button type="button" className="button" onClick={() => setConfirming(false)} disabled={deleting}>
              {t("Cancelar")}
            </button>
          </div>
          {error && <p className="error-text">{error}</p>}
        </form>
      )}
    </section>
  );
}

function GameShelf({ title, games, empty }) {
  return (
    <section className="profile-section" aria-label={title}>
      <h2>{title}</h2>
      {games.length === 0 ? (
        <p className="hint">{empty}</p>
      ) : (
        <ul className="profile-shelf">
          {games.map((game) => (
            <li key={game.appid} title={game.name}>
              <img src={game.header_image} alt="" loading="lazy" />
              <span>{game.name}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Juegos que tienen los dos, filtrables por modo (cooperativo, multijugador…). */
function GamesInCommon({ steamId, name }) {
  const [games, setGames] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("coop");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setGames(await fetchGamesInCommon(steamId));
    } catch (err) {
      setError(err.response?.data?.detail ?? t("No se pudieron comparar las bibliotecas."));
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => (games ?? []).filter((game) => matchesFilters(game, { mode, hideAdult: true, hideSoftware: true })), [games, mode]);

  return (
    <section className="profile-section profile-common" aria-labelledby="profile-common">
      <div className="profile-common__header">
        <h2 id="profile-common">{t("¿Qué tenemos en común?")}</h2>
        {games && (
          <select className="select" value={mode} onChange={(event) => setMode(event.target.value)} aria-label={t("Modo de juego")}>
            {MODE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {t(option.label)}
              </option>
            ))}
          </select>
        )}
      </div>
      {!games && (
        <>
          <p className="hint">{t("Compará tu biblioteca con la de {name} para encontrar juegos que tengan los dos, por ejemplo cooperativos para jugar juntos.", { name })}</p>
          <button type="button" className="button button--primary" onClick={load} disabled={loading}>
            {loading ? t("Comparando…") : t("Comparar bibliotecas")}
          </button>
        </>
      )}
      {error && <p className="error-text">{error}</p>}
      {games && (
        <>
          <p className="hint">
            {mode !== "any"
              ? t("Tienen {count} juegos en común; {filtered} con este modo.", { count: formatNumber(games.length), filtered: formatNumber(filtered.length) })
              : t("Tienen {count} juegos en común.", { count: formatNumber(games.length) })}{" "}
            {t("Para girar entre ellos, sumá a {name} a tu familia y activá “En común con la familia”.", { name })}
          </p>
          {filtered.length > 0 && (
            <ul className="profile-shelf">
              {filtered.slice(0, 48).map((game) => (
                <li key={game.appid} title={game.name}>
                  <img src={game.header_image} alt="" loading="lazy" />
                  <span>{game.name}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

export default ProfilePage;
