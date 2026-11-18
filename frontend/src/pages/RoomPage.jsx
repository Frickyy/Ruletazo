import { useEffect, useMemo, useRef, useState } from "react";
import Reel from "../components/Reel.jsx";
import SteamLoginButton from "../components/SteamLoginButton.jsx";
import { unlockAudio } from "../services/reelSound.js";
import { fetchRoom, joinRoom, setRoomVeto, spinRoom } from "../services/roomService.js";
import { formatNumber, t } from "../i18n/index.js";
import "./RoomPage.css";

const POLL_MS = 2000;
const PAGE_SIZE = 60;

/**
 * Sala en grupo (#/sala/<código>). Todos ven el mismo rodillo: quien armó la sala gira, el
 * backend elige al azar entre los juegos que nadie vetó y cada navegador anima hasta ese juego.
 * El estado se consulta cada 2 segundos (solo con la pestaña visible).
 */
function RoomPage({ code, viewer, onLogin, onBack }) {
  const [room, setRoom] = useState(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [spin, setSpin] = useState(null);
  const [settledId, setSettledId] = useState(null);
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [copied, setCopied] = useState(false);
  const seenSpinId = useRef(null);

  function applyRoom(next) {
    setRoom(next);
    setError("");
    const nextSpin = next.spin;
    if (!nextSpin || nextSpin.id === seenSpinId.current) return;
    const winner = next.pool.find((game) => game.appid === nextSpin.appid);
    // Al entrar se muestra el último resultado quieto; los giros nuevos se animan.
    const instant = seenSpinId.current === null;
    seenSpinId.current = nextSpin.id;
    if (winner) setSpin({ id: nextSpin.id, winner, instant });
  }

  useEffect(() => {
    if (!code) return undefined;
    let cancelled = false;
    seenSpinId.current = null;
    async function poll() {
      if (document.hidden) return;
      try {
        const next = await fetchRoom(code);
        if (!cancelled) applyRoom(next);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.detail ?? t("No se pudo cargar la sala."));
      }
    }
    poll();
    const timer = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, viewer?.steam_id]);

  // El rodillo se rearma si cambia el pool: se memoriza por contenido, no por cada consulta.
  const poolKey = room ? room.pool.map((game) => game.appid).join(",") : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pool = useMemo(() => room?.pool ?? [], [poolKey]);

  const filtered = useMemo(() => {
    const value = search.trim().toLocaleLowerCase("es");
    return value ? pool.filter((game) => game.name.toLocaleLowerCase("es").includes(value)) : pool;
  }, [pool, search]);

  useEffect(() => setVisible(PAGE_SIZE), [search]);

  if (!code) return <RoomMessage title={t("Sala")} text={t("Ese link de sala no es válido.")} onBack={onBack} />;
  if (error && !room) return <RoomMessage title={t("Sala")} text={error} onBack={onBack} />;
  if (!room) return <p className="hint">{t("Cargando la sala…")}</p>;

  const names = Object.fromEntries(room.members.map((member) => [member.steam_id, member.name]));
  const host = room.members.find((member) => member.steam_id === room.host_steam_id);
  const vetoedCount = Object.keys(room.vetoes).length;
  const available = pool.length - vetoedCount;
  const isSpinning = spin !== null && !spin.instant && settledId !== spin.id;
  const winner = spin && (spin.instant || settledId === spin.id) ? spin.winner : null;

  async function run(action) {
    setBusy(true);
    setActionError("");
    try {
      applyRoom(await action());
    } catch (err) {
      setActionError(err.response?.data?.detail ?? t("No se pudo completar. Probá de nuevo."));
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    const url = `${window.location.origin}${window.location.pathname}#/sala/${room.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t("Copiá el link de la sala:"), url);
    }
  }

  return (
    <section className="room" aria-labelledby="room-title">
      <header className="room__hero">
        <div>
          <p className="eyebrow">
            {t("Sala")} <span className="mono">{room.code}</span>
          </p>
          <h1 id="room-title">{t("¿Qué jugamos juntos?")}</h1>
          <p className="room__lead">
            {host
              ? t("Vetá los juegos que no querés. {name} gira y sale uno de los que nadie vetó.", { name: host.name })
              : t("Vetá los juegos que no querés. Quien armó la sala gira y sale uno de los que nadie vetó.")}
          </p>
        </div>
        <div className="room__share">
          <button type="button" className="button" onClick={copyLink}>
            {copied ? t("¡Link copiado!") : t("Copiar link de la sala")}
          </button>
        </div>
      </header>

      <ul className="room__members" aria-label={t("Personas en la sala")}>
        {room.members.map((member) => (
          <li key={member.steam_id} className="room__member">
            {member.avatar ? <img src={member.avatar} alt="" /> : <span className="room__avatar" aria-hidden="true" />}
            <span>{member.name}</span>
            {member.steam_id === room.host_steam_id && <span className="tag">{t("arma")}</span>}
          </li>
        ))}
      </ul>

      <Reel pool={pool} spin={spin} onSettled={() => setSettledId(spin?.id)} />
      <p className="visually-hidden" aria-live="polite">
        {isSpinning ? t("Girando la ruleta…") : winner ? t("Salió {name}", { name: winner.name }) : ""}
      </p>

      <div className="room__controls">
        {!viewer ? (
          <>
            <p className="hint">{t("Iniciá sesión con Steam para entrar a la sala y vetar juegos.")}</p>
            <SteamLoginButton onClick={onLogin} />
          </>
        ) : !room.is_member ? (
          <button type="button" className="button button--primary room__main" onClick={() => run(() => joinRoom(room.code))} disabled={busy}>
            {t("Entrar a la sala")}
          </button>
        ) : room.is_host ? (
          <button
            type="button"
            className="button button--primary room__main"
            onClick={() => {
              unlockAudio();
              run(() => spinRoom(room.code));
            }}
            disabled={busy || isSpinning || available === 0}
          >
            {isSpinning ? t("Girando…") : t("Girar para todos")}
          </button>
        ) : (
          <p className="hint">{t("Estás adentro. Cuando {name} gire, lo ves acá al mismo tiempo.", { name: host?.name ?? t("quien armó la sala") })}</p>
        )}
        <p className="room__count mono">
          {t("{available} de {total} juegos en juego", { available: formatNumber(available), total: formatNumber(pool.length) })}
        </p>
      </div>

      {actionError && (
        <p className="error-text" role="alert">
          {actionError}
        </p>
      )}

      {winner && (
        <div className="room__winner">
          <img src={winner.image} alt="" />
          <div>
            <p className="eyebrow">{t("Salió")}</p>
            <h2>{winner.name}</h2>
            <div className="room__winner-actions">
              <a className="button button--primary" href={`steam://run/${winner.appid}`}>
                ▶ {t("Jugar ahora")}
              </a>
              <a className="button" href={`https://store.steampowered.com/app/${winner.appid}/`} target="_blank" rel="noopener noreferrer">
                {t("Ver en Steam")} ↗
              </a>
            </div>
          </div>
        </div>
      )}

      <section className="room__pool" aria-labelledby="room-pool">
        <div className="room__pool-heading">
          <h2 id="room-pool">{t("Juegos de la sala")}</h2>
          <input
            className="text-input"
            type="search"
            placeholder={t("Buscar un juego")}
            aria-label={t("Buscar un juego de la sala")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <ul className="room__games">
          {filtered.slice(0, visible).map((game) => {
            const voters = room.vetoes[String(game.appid)] ?? [];
            const mine = viewer && voters.includes(viewer.steam_id);
            return (
              <li key={game.appid} className={`room-game${voters.length ? " room-game--vetoed" : ""}`}>
                <img src={game.image} alt="" loading="lazy" />
                <div className="room-game__body">
                  <strong>{game.name}</strong>
                  <small className="muted">{voters.length ? t("Vetado por {names}", { names: voters.map((id) => names[id] ?? t("alguien")).join(", ") }) : " "}</small>
                  {room.is_member && (
                    <button
                      type="button"
                      className="text-button"
                      aria-pressed={Boolean(mine)}
                      onClick={() => run(() => setRoomVeto(room.code, game.appid, !mine))}
                      disabled={busy || isSpinning}
                    >
                      {mine ? t("Quitar mi veto") : t("Vetar")}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {filtered.length > visible && (
          <button type="button" className="button room__more" onClick={() => setVisible((count) => count + PAGE_SIZE)}>
            {t("Ver más")} ({formatNumber(filtered.length - visible)})
          </button>
        )}
        {filtered.length === 0 && <p className="hint">{t("Ningún juego de la sala coincide con esa búsqueda.")}</p>}
      </section>
    </section>
  );
}

function RoomMessage({ title, text, onBack }) {
  return (
    <section className="room">
      <h1>{title}</h1>
      <p className="hint">{text}</p>
      <button type="button" className="button" onClick={onBack}>
        {t("Ir a la ruleta")}
      </button>
    </section>
  );
}

export default RoomPage;
