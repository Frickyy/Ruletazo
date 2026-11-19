import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { avoidAdjacentRepeats, sample } from "../services/reelStrip.js";
import "./Reel.css";

// Portadas a cada lado del centro que se mantienen en pantalla.
const SIDE = 7;
// Cuántas portadas pasan por la ventana en cada giro (más = giro más largo).
const SPIN_DISTANCE = 38;
// Debe coincidir con la duración de la transición en Reel.css.
const SPIN_DURATION_MS = 4600;

/**
 * Rodillo horizontal de portadas "en vivo".
 *
 * El juego que gana es el que frena dentro de la ventana: cuando llega un `spin`
 * ({ id, winner }), la tira se arma con el ganador en la posición de llegada y se anima en
 * un solo movimiento que desacelera hasta quedar ahí. Al terminar llama a `onSettled(winner)`.
 * Quieto, muestra juegos de `pool` (los que cumplen los filtros) y se rearma si cambian.
 * Con `spin.instant` (un juego elegido a mano) el ganador queda en el centro sin girar.
 * El ganador frena siempre centrado: antes se corría un poco al azar y quedaba fuera del marco.
 */
function Reel({ pool, spin, onSettled }) {
  const [strip, setStrip] = useState(() => idleStrip(pool));
  const [index, setIndex] = useState(SIDE);
  const [settled, setSettled] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [pendingTarget, setPendingTarget] = useState(null);
  const trackRef = useRef(null);
  const stripRef = useRef(strip);
  const settleRef = useRef(null);
  const finishRef = useRef(null);
  stripRef.current = strip;

  // Filtros nuevos → tira nueva al instante (si el juego del centro sigue siendo válido, queda).
  useEffect(() => {
    if (animating) return;
    const center = stripRef.current[SIDE];
    const keepCenter = center && pool.some((game) => game.appid === center.appid);
    if (!keepCenter) setSettled(false);
    setStrip(idleStrip(pool, keepCenter ? center : null));
    setIndex(SIDE);
  }, [pool]);

  useEffect(() => {
    if (!spin) return undefined;
    setSettled(false);
    if (spin.instant) {
      setAnimating(false);
      setStrip(idleStrip(pool, spin.winner));
      setIndex(SIDE);
      setSettled(true);
      onSettled?.(spin.winner);
      return undefined;
    }
    const current = stripRef.current;
    // 1) Se conserva exactamente lo que se ve ahora (sin transición, no se mueve nada)...
    const visible = current.slice(index - SIDE, index + SIDE + 1);
    const fillers = sample(pool, SPIN_DISTANCE - SIDE - 1);
    const tail = sample(pool, SIDE);
    const target = visible.length + fillers.length;
    // Lo visible y el ganador quedan fijos; el resto se reacomoda para no repetir portadas pegadas.
    const fixed = new Set([...visible.keys(), target]);
    const nextStrip = avoidAdjacentRepeats([...visible, ...fillers, spin.winner, ...tail], fixed);
    setAnimating(false);
    setStrip(nextStrip);
    setIndex(SIDE);
    // 2) ...y apenas se pinta esa tira, arranca el giro (ver el useLayoutEffect de abajo).
    setPendingTarget(target);

    const finish = () => {
      if (settleRef.current === null) return;
      clearTimeout(settleRef.current);
      settleRef.current = null;
      setAnimating(false);
      setStrip(nextStrip.slice(target - SIDE, target + SIDE + 1));
      setIndex(SIDE);
      setSettled(true);
      onSettled?.(spin.winner);
    };
    // Respaldo por si el navegador no dispara transitionend (pestaña en segundo plano, etc.).
    settleRef.current = setTimeout(finish, SPIN_DURATION_MS + 400);
    finishRef.current = finish;

    return () => {
      if (settleRef.current !== null) clearTimeout(settleRef.current);
      settleRef.current = null;
    };
  }, [spin?.id]);

  // Forzar un reflow con la tira en la posición inicial y recién ahí cambiar --index hace que
  // el navegador anime desde donde estaba (no depende de requestAnimationFrame, que se
  // congela con la pestaña en segundo plano).
  useLayoutEffect(() => {
    if (pendingTarget === null || !trackRef.current) return;
    void trackRef.current.offsetWidth;
    setAnimating(true);
    setIndex(pendingTarget);
    setPendingTarget(null);
  }, [pendingTarget]);

  function handleTransitionEnd(event) {
    if (event.target === event.currentTarget && event.propertyName === "transform") finishRef.current?.();
  }

  return (
    <div className={`reel${animating ? " reel--spinning" : ""}${settled ? " reel--settled" : ""}`} aria-hidden="true">
      <div
        ref={trackRef}
        className={`reel__track${animating ? " reel__track--spinning" : ""}`}
        style={{ "--index": index }}
        onTransitionEnd={handleTransitionEnd}
      >
        {strip.map((game, position) => (
          <div
            className={`reel__card${!animating && position === index ? " reel__card--center" : ""}`}
            key={`${game.appid}-${position}`}
          >
            <span className="reel__card-name">{game.name}</span>
            <img src={game.image} alt="" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />
          </div>
        ))}
      </div>
      <div className="reel__marker" />
    </div>
  );
}

function idleStrip(pool, center = null) {
  const cards = sample(pool, SIDE * 2 + 1);
  if (center && cards.length) cards[SIDE] = center;
  return avoidAdjacentRepeats(cards, center ? new Set([SIDE]) : new Set());
}

export default Reel;
