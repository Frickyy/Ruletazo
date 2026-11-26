import { useCallback, useEffect, useMemo, useState } from "react";
import Reel from "../components/Reel.jsx";
import { t } from "../i18n/index.js";
import { DEMO_GAMES } from "../services/demoGames.js";
import { fetchGameDetails, fetchLibrary } from "../services/gameService.js";
import { unlockAudio } from "../services/reelSound.js";
import { RECENT_WINNERS, overlayPool, pickWinner, readOverlayOptions } from "../services/streamerOverlay.js";
import { trackOnce } from "../services/track.js";
import "./StreamerOverlay.css";

const DESIGN_WIDTH = 800;
const DESIGN_HEIGHT = 450;

/**
 * La superposición del modo streamer: solo la ruleta, el juego que salió y la marca, sobre fondo
 * transparente (o verde, para recortarlo). Se gira con un clic o con la barra espaciadora; en OBS,
 * desde "Interactuar" en la fuente. Se dibuja sin el resto de la página (ver main.jsx).
 */
function StreamerOverlay() {
  const options = useMemo(() => readOverlayOptions(window.location.search), []);
  const steamId = options.demo ? "" : options.profile;
  const [games, setGames] = useState(options.demo ? DEMO_GAMES : []);
  const [status, setStatus] = useState(options.demo ? "ready" : "loading"); // loading | ready | private | error
  const [spin, setSpin] = useState(null);
  const [settledId, setSettledId] = useState(null);
  const [result, setResult] = useState(null); // { spinId, game }
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    document.documentElement.classList.add("obs-overlay", `obs-overlay--${options.background}`);
    document.title = "Ruletazo · OBS";
    // La vista previa de /obs (un iframe) no cuenta como uso: solo la fuente de OBS o la ventana.
    if (window.self === window.top) trackOnce("streamer_overlay");
  }, [options.background]);

  // Está pensada para una fuente de 800×450: con otro tamaño se agranda o achica entera.
  useEffect(() => {
    const fit = () => {
      const scale = Math.min(window.innerWidth / DESIGN_WIDTH, window.innerHeight / DESIGN_HEIGHT);
      document.documentElement.style.setProperty("--obs-scale", String(scale));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    if (options.demo) return undefined;
    let cancelled = false;
    fetchLibrary({ steamId })
      .then((library) => {
        if (cancelled) return;
        setGames(library);
        setStatus("ready");
      })
      .catch((error) => {
        if (!cancelled) setStatus(error.response?.status === 403 ? "private" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [options.demo, steamId]);

  const pool = useMemo(() => overlayPool(games, options.filter), [games, options.filter]);
  const spinning = spin !== null && settledId !== spin.id;

  const spinNow = useCallback(() => {
    if (spinning || pool.length === 0) return;
    if (options.sound) unlockAudio();
    const winner = pickWinner(pool, recent);
    setResult(null);
    setSpin({ id: Date.now(), winner });
    setRecent((current) => [winner.appid, ...current].slice(0, RECENT_WINNERS));
  }, [spinning, pool, recent, options.sound]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.code !== "Space" && event.key !== "Enter") return;
      event.preventDefault();
      spinNow();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [spinNow]);

  function handleSettled(winner) {
    const spinId = spin?.id;
    setSettledId(spinId);
    fetchGameDetails({ steamId: steamId || undefined, appid: winner.appid })
      .then((game) => setResult({ spinId, game }))
      .catch(() => setResult({ spinId, game: winner }));
  }

  const shown = result && result.spinId === spin?.id ? result.game : null;

  return (
    <main className="obs" onClick={spinNow}>
      <div className="obs__panel">
        <div className="obs__top">
          <span className="obs__title">{spinning ? t("Girando…") : t("¿Qué jugamos?")}</span>
          <span className="obs__brand">ruletazo.app</span>
        </div>
        {status === "ready" && pool.length > 0 && <Reel pool={pool} spin={spin} onSettled={handleSettled} sound={options.sound} />}
        <div className="obs__result" aria-live="polite">
          {status === "loading" && <span className="obs__note">{t("Cargando la biblioteca…")}</span>}
          {status === "private" && (
            <span className="obs__note">{t("Tu biblioteca es privada en Steam: hacé públicos los «Detalles de juegos» y recargá la fuente.")}</span>
          )}
          {status === "error" && <span className="obs__note">{t("No se pudo cargar la biblioteca. Revisá el perfil en la dirección.")}</span>}
          {status === "ready" && pool.length === 0 && <span className="obs__note">{t("No hay juegos con este filtro.")}</span>}
          {status === "ready" && pool.length > 0 && !spin && <span className="obs__note">{t("Tocá o apretá espacio para girar")}</span>}
          {shown && (
            <>
              <strong className="obs__game">{shown.name}</strong>
              {shown.duration_hours != null && (
                <span className="obs__meta">
                  {t("{hours} h para terminarlo", { hours: Math.max(1, Math.round(shown.duration_hours)) })}
                  {shown.duration_source === "igdb" ? " · IGDB" : ""}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export default StreamerOverlay;
