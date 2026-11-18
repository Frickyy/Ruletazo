import { useEffect, useMemo, useState } from "react";
import { deleteMyData, fetchGamesInCommon, fetchProfile, updateMyPreferences } from "../services/profileService.js";
import SteamLoginButton from "../components/SteamLoginButton.jsx";
import { MODE_OPTIONS, matchesFilters } from "../services/libraryFilters.js";
import SupporterBadge from "../components/SupporterBadge.jsx";
import "./ProfilePage.css";

/**
 * Perfil: qué está jugando, qué terminó, favoritos y reseñas del foro.
 * Privado por defecto; el dueño lo puede hacer público y compartir el link.
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

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Pila de pendientes y desafíos del mes (se calculan en el backend con los estados marcados). */
function Challenges({ challenges, backlog, isMe }) {
  const done = challenges.items.filter((item) => item.progress >= item.goal).length;
  return (
    <section className="profile-section" aria-labelledby="profile-challenges">
      <div className="profile-section__heading">
        <h2 id="profile-challenges">Desafíos de {MONTHS[challenges.month - 1]}</h2>
        <span className="muted mono">
          {done} de {challenges.items.length} cumplidos
        </span>
      </div>
      <ul className="challenges">
        {backlog && (
          <li className="challenge challenge--backlog">
            <strong>Pila de pendientes</strong>
            <span className="challenge__number">{backlog.unplayed.toLocaleString("es-AR")}</span>
            <small>
              {backlog.total > 0
                ? `juegos sin estrenar (${Math.round((backlog.unplayed / backlog.total) * 100)}% de la biblioteca)`
                : "Todavía no hay biblioteca cargada."}
            </small>
          </li>
        )}
        {challenges.items.map((item) => {
          const complete = item.progress >= item.goal;
          return (
            <li key={item.id} className={`challenge${complete ? " challenge--done" : ""}`}>
              <strong>
                {complete && <span aria-hidden="true">✓ </span>}
                {item.title}
              </strong>
              <small>{item.description}</small>
              <span className="challenge__bar" role="progressbar" aria-valuemin={0} aria-valuemax={item.goal} aria-valuenow={item.progress} aria-label={item.title}>
                <span style={{ width: `${(item.progress / item.goal) * 100}%` }} />
              </span>
              <span className="challenge__count mono">
                {item.progress} / {item.goal}
              </span>
            </li>
          );
        })}
      </ul>
      {isMe && <p className="hint">Se renuevan el primer día de cada mes. Para avanzar, marcá tus juegos como “Jugando” o “Terminado” desde la ficha de la ruleta.</p>}
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
        if (!cancelled) setError(err.response?.data?.detail ?? "No se pudo cargar el perfil.");
      });
    return () => {
      cancelled = true;
    };
  }, [targetId, viewer?.steam_id]);

  if (!targetId) {
    return (
      <section className="profile-page">
        <h1>Tu perfil</h1>
        <p className="hint">Iniciá sesión con Steam para ver y armar tu perfil.</p>
        <SteamLoginButton onClick={onLogin} className="profile-page__login" />
      </section>
    );
  }
  if (error) {
    return (
      <section className="profile-page">
        <h1>Perfil</h1>
        <p className="hint">{error}</p>
      </section>
    );
  }
  if (!profile) return <p className="hint">Cargando perfil…</p>;

  async function savePreference(patch) {
    setSaving(true);
    setSaveError("");
    try {
      const preferences = await updateMyPreferences(patch);
      setProfile((current) => ({ ...current, is_public: preferences.is_public, preferences }));
      onPreferencesChange?.(preferences);
    } catch (err) {
      setSaveError(err.response?.data?.detail ?? "No se pudo guardar el cambio. Probá de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    const url = `${window.location.origin}${window.location.pathname}#/perfil/${profile.steam_id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copiá el link de tu perfil:", url);
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
          <p className="eyebrow">{profile.is_me ? "Tu perfil" : "Perfil"}</p>
          <h1 id="profile-title">
            {profile.name}
            {profile.is_supporter && <SupporterBadge />}
          </h1>
          <p className="profile-hero__meta">
            <span className={`tag${profile.is_public ? " tag--public" : ""}`}>{profile.is_public ? "Público" : "Privado"}</span>
            <span>{profile.library_size.toLocaleString("es-AR")} juegos en la biblioteca</span>
          </p>
        </div>
        <div className="profile-hero__actions">
          {profile.is_me && profile.is_public && (
            <button type="button" className="button" onClick={copyLink}>
              {copied ? "¡Link copiado!" : "Copiar link del perfil"}
            </button>
          )}
          {!profile.is_me && viewer && !isFamily && (
            <button type="button" className="button" onClick={() => onAddToFamily?.(profile.steam_id)} disabled={familyIds.filter(Boolean).length >= 5}>
              Sumar a mi familia
            </button>
          )}
          {!profile.is_me && isFamily && <span className="tag">En tu familia</span>}
        </div>
      </header>

      {profile.is_me && (
        <section className="profile-settings" aria-label="Preferencias del perfil">
          <label className="profile-settings__item">
            <input type="checkbox" checked={profile.preferences.is_public} disabled={saving} onChange={(event) => savePreference({ is_public: event.target.checked })} />
            <span>
              <strong>Perfil público</strong>
              <small>Cualquiera con el link ve lo que estás jugando, lo que terminaste, tus favoritos y tus reseñas. Tu biblioteca completa no se muestra.</small>
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
              <strong>Seguir mi progreso de logros</strong>
              <small>Consulta a Steam cuántos logros tenés en cada juego que jugaste, para el filtro “Casi al 100%”. Necesita que tus logros sean públicos en Steam.</small>
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
          <dt>Jugando</dt>
          <dd>{summary.counts.playing}</dd>
        </div>
        <div>
          <dt>Terminados</dt>
          <dd>{summary.counts.finished}</dd>
        </div>
        <div>
          <dt>Abandonados</dt>
          <dd>{summary.counts.abandoned}</dd>
        </div>
        <div className="profile-stats__accent">
          <dt>Terminados en {summary.year}</dt>
          <dd>{summary.finished_this_year}</dd>
        </div>
      </dl>

      {profile.challenges && <Challenges challenges={profile.challenges} backlog={profile.backlog} isMe={profile.is_me} />}

      <GameShelf title="Jugando ahora" games={profile.playing} empty={profile.is_me ? "Marcá un juego como “Jugando” desde la ficha de la ruleta." : "No está jugando nada por ahora."} />
      <GameShelf title="Terminados" games={profile.finished} empty={profile.is_me ? "Cuando termines un juego, marcalo como “Terminado”." : "Todavía no marcó juegos como terminados."} />
      <GameShelf title="Favoritos" games={profile.favorites} empty="Sin favoritos todavía." />

      <section className="profile-section" aria-labelledby="profile-reviews">
        <h2 id="profile-reviews">Reseñas en el foro</h2>
        {profile.reviews.length === 0 ? (
          <p className="hint">Todavía no escribió reseñas.</p>
        ) : (
          <ul className="profile-reviews">
            {profile.reviews.map((review) => (
              <li key={review.id}>
                <button type="button" className="profile-review" onClick={() => onOpenForum?.({ appid: review.appid, name: review.game_name, tab: "reviews" })}>
                  <span className="score-badge" aria-label={`Puntaje ${review.score} de 10`}>{review.score}</span>
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
          <button type="button" className="text-button" onClick={onLogin}>Iniciá sesión</button> para ver qué juegos tienen en común.
        </p>
      )}
      {profile.is_me && !profile.is_public && (
        <p className="hint">Tu perfil es privado: solo lo ves vos. Activá “Perfil público” para compartirlo.</p>
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
      setError(err.response?.data?.detail ?? "No se pudieron borrar los datos. Probá de nuevo.");
      setDeleting(false);
    }
  }

  return (
    <section className="profile-section profile-danger" aria-labelledby="profile-danger">
      <h2 id="profile-danger">Borrar mis datos</h2>
      <p className="hint">
        Elimina tu perfil, favoritos, ocultos, estados, progreso de logros, la copia de tu biblioteca y tus mensajes del foro, y cierra
        tu sesión. No se puede deshacer.
      </p>
      {!confirming ? (
        <button type="button" className="button profile-danger__button" onClick={() => setConfirming(true)}>
          Borrar mis datos…
        </button>
      ) : (
        <form className="profile-danger__form" onSubmit={handleDelete}>
          <label>
            Escribí <strong>BORRAR</strong> para confirmar
            <input className="text-input" value={text} onChange={(event) => setText(event.target.value)} autoComplete="off" />
          </label>
          <div className="profile-danger__actions">
            <button type="submit" className="button profile-danger__button" disabled={text.trim().toUpperCase() !== "BORRAR" || deleting}>
              {deleting ? "Borrando…" : "Borrar todo"}
            </button>
            <button type="button" className="button" onClick={() => setConfirming(false)} disabled={deleting}>
              Cancelar
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
      setError(err.response?.data?.detail ?? "No se pudieron comparar las bibliotecas.");
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => (games ?? []).filter((game) => matchesFilters(game, { mode, hideAdult: true })), [games, mode]);

  return (
    <section className="profile-section profile-common" aria-labelledby="profile-common">
      <div className="profile-common__header">
        <h2 id="profile-common">¿Qué tenemos en común?</h2>
        {games && (
          <select className="select" value={mode} onChange={(event) => setMode(event.target.value)} aria-label="Modo de juego">
            {MODE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      </div>
      {!games && (
        <>
          <p className="hint">Compará tu biblioteca con la de {name} para encontrar juegos que tengan los dos, por ejemplo cooperativos para jugar juntos.</p>
          <button type="button" className="button button--primary" onClick={load} disabled={loading}>
            {loading ? "Comparando…" : "Comparar bibliotecas"}
          </button>
        </>
      )}
      {error && <p className="error-text">{error}</p>}
      {games && (
        <>
          <p className="hint">
            Tienen {games.length.toLocaleString("es-AR")} juegos en común
            {mode !== "any" ? `; ${filtered.length.toLocaleString("es-AR")} con este modo` : ""}. Para girar entre ellos, sumá a {name} a tu familia y activá “En común con la familia”.
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
