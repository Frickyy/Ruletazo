import { useEffect, useMemo, useState } from "react";
import "./Reel.css";

// Cantidad de portadas en el rodillo quieto: impar, para que haya una en el centro.
const STRIP_SIZE = 9;
const CENTER = Math.floor(STRIP_SIZE / 2);
// Portadas que pasan en loop mientras se espera la respuesta del backend.
const SPIN_SIZE = 16;
// Opacidad según la distancia al centro: la ventana marca el juego elegido.
const FADE_BY_DISTANCE = [1, 0.75, 0.5, 0.32, 0.2];

/**
 * Rodillo horizontal de portadas.
 * - Quieto: muestra juegos al azar de `pool`.
 * - Girando (`isSpinning`): las portadas pasan en loop.
 * - Con `result`: frena con el juego elegido dentro de la ventana central.
 * Es decorativo (aria-hidden); el estado se anuncia en un texto oculto para lectores de pantalla.
 */
function Reel({ pool, result, isSpinning }) {
  const [strip, setStrip] = useState(() => sample(pool, STRIP_SIZE));
  const [landingKey, setLandingKey] = useState(0);

  const resultAppid = result?.appid;

  // Rodillo quieto: se vuelve a mezclar cuando cambian los filtros (salvo que esté mostrando un resultado).
  useEffect(() => {
    if (!isSpinning && !result) setStrip(sample(pool, STRIP_SIZE));
  }, [pool]);

  // Llegó un resultado: se arma la tira con ese juego en el centro y se anima la frenada.
  // Depende del appid (no del objeto) para que marcar favorito no vuelva a animar.
  useEffect(() => {
    if (!result) return;
    const chosen = { appid: result.appid, name: result.name, image: result.header_image };
    const others = sample(pool.filter((game) => game.appid !== result.appid), STRIP_SIZE - 1);
    setStrip([...others.slice(0, CENTER), chosen, ...others.slice(CENTER)]);
    setLandingKey((key) => key + 1);
  }, [resultAppid]);

  const spinTrack = useMemo(() => (isSpinning ? sample(pool, SPIN_SIZE) : []), [isSpinning, pool]);

  return (
    <>
      <div className="reel" aria-hidden="true">
        {isSpinning ? (
          <div className="reel__track reel__track--spinning">
            {[...spinTrack, ...spinTrack].map((game, index) => (
              <ReelCard key={`${game.appid}-${index}`} game={game} opacity={0.85} />
            ))}
          </div>
        ) : (
          <div key={landingKey} className={`reel__track${result ? " reel__track--landing" : ""}`}>
            {strip.map((game, index) => (
              <ReelCard
                key={`${game.appid}-${index}`}
                game={game}
                opacity={FADE_BY_DISTANCE[Math.min(Math.abs(index - CENTER), FADE_BY_DISTANCE.length - 1)]}
              />
            ))}
          </div>
        )}
        <div className="reel__window" />
        <div className="reel__pointer" />
      </div>
      <p className="visually-hidden" aria-live="polite">
        {isSpinning ? "Buscando un juego…" : result ? `Te tocó ${result.name}` : ""}
      </p>
    </>
  );
}

function ReelCard({ game, opacity }) {
  return (
    <div className="reel__card" style={{ opacity }}>
      <span className="reel__card-name">{game.name}</span>
      <img src={game.image} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />
    </div>
  );
}

/** `count` juegos al azar de `pool`; si el pool es más chico, se repiten. */
function sample(pool, count) {
  if (pool.length === 0) return [];
  const shuffled = [...pool];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  const picked = [];
  while (picked.length < count) picked.push(...shuffled);
  return picked.slice(0, count);
}

export default Reel;
