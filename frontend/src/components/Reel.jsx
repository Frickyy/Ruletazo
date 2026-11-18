import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
 */
function Reel({ pool, spin, onSettled }) {
  const [strip, setStrip] = useState(() => idleStrip(pool));
  const [index, setIndex] = useState(SIDE);
  const [nudge, setNudge] = useState(0);
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
    setStrip(idleStrip(pool, keepCenter ? center : null));
    setIndex(SIDE);
  }, [pool]);

  useEffect(() => {
    if (!spin) return undefined;
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
  // congela con la pestaña en segundo plano). El ganador frena un poco corrido del centro.
  useLayoutEffect(() => {
    if (pendingTarget === null || !trackRef.current) return;
    void trackRef.current.offsetWidth;
    setAnimating(true);
    setIndex(pendingTarget);
    setNudge((Math.random() - 0.5) * 0.6);
    setPendingTarget(null);
  }, [pendingTarget]);

  function handleTransitionEnd(event) {
    if (event.target === event.currentTarget && event.propertyName === "transform") finishRef.current?.();
  }

  return (
    <div className="reel" aria-hidden="true">
      <div
        ref={trackRef}
        className={`reel__track${animating ? " reel__track--spinning" : ""}`}
        style={{ "--index": index, "--nudge": nudge }}
        onTransitionEnd={handleTransitionEnd}
      >
        {strip.map((game, position) => (
          <div className="reel__card" key={`${game.appid}-${position}`}>
            <span className="reel__card-name">{game.name}</span>
            <img src={game.image} alt="" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />
          </div>
        ))}
      </div>
      <div className="reel__window" />
      <div className="reel__pointer" />
    </div>
  );
}

function idleStrip(pool, center = null) {
  const cards = sample(pool, SIDE * 2 + 1);
  if (center && cards.length) cards[SIDE] = center;
  return avoidAdjacentRepeats(cards, center ? new Set([SIDE]) : new Set());
}

/**
 * Con pocos juegos la tira los repite, y a veces quedaban dos portadas iguales pegadas.
 * Intercambia cada repetida con otra posición libre que no choque con sus vecinas.
 * `fixed` son posiciones que no se mueven (lo que ya se ve y el ganador).
 */
function avoidAdjacentRepeats(cards, fixed = new Set()) {
  const result = [...cards];
  const same = (a, b) => a && b && a.appid === b.appid;
  const fits = (card, position) => !same(card, result[position - 1]) && !same(card, result[position + 1]);
  for (let i = 1; i < result.length; i += 1) {
    if (!same(result[i], result[i - 1])) continue;
    const toMove = fixed.has(i) ? i - 1 : i;
    if (fixed.has(toMove)) continue;
    for (let j = 0; j < result.length; j += 1) {
      if (j === toMove || fixed.has(j) || same(result[j], result[toMove])) continue;
      const a = result[toMove];
      const b = result[j];
      result[toMove] = b;
      result[j] = a;
      if (fits(b, toMove) && fits(a, j)) break;
      result[toMove] = a;
      result[j] = b;
    }
  }
  return result;
}

/** `count` juegos al azar de `pool`; si el pool es más chico, se repiten. */
function sample(pool, count) {
  if (pool.length === 0) return [];
  const picked = [];
  while (picked.length < count) {
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    picked.push(...shuffled);
  }
  return picked.slice(0, count);
}

export default Reel;
