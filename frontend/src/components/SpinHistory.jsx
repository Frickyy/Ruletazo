import { useCallback, useEffect, useState } from "react";
import { t } from "../i18n/index.js";
import "./SpinHistory.css";

const MAX_ITEMS = 8;

/**
 * Últimos juegos que salieron en la ruleta, para volver a alguno con un clic.
 * Se guarda en este navegador (es una comodidad, no un dato importante): si el
 * almacenamiento está bloqueado, el historial vive solo mientras la página esté abierta.
 */
export function useSpinHistory(steamId) {
  const key = `steamRoulette.history.${steamId || "demo"}`;
  const [items, setItems] = useState(() => read(key));

  useEffect(() => {
    setItems(read(key));
  }, [key]);

  const add = useCallback(
    (game) => {
      if (!game?.appid) return;
      setItems((current) => {
        const next = [{ appid: game.appid, name: game.name, image: game.image }, ...current.filter((item) => item.appid !== game.appid)].slice(0, MAX_ITEMS);
        write(key, next);
        return next;
      });
    },
    [key],
  );

  return [items, add];
}

function SpinHistory({ items, onPick, disabled, currentAppid }) {
  return (
    <section className="spin-history" aria-labelledby="spin-history-title">
      <h2 id="spin-history-title">{t("Últimos que salieron")}</h2>
      <ul>
        {items.map((game) => (
          <li key={game.appid}>
            <button
              type="button"
              className="spin-history__item"
              onClick={() => onPick(game)}
              disabled={disabled}
              aria-current={game.appid === currentAppid ? "true" : undefined}
              title={game.name}
            >
              <img src={game.image} alt="" loading="lazy" />
              <span className="visually-hidden">{game.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function read(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item?.appid).slice(0, MAX_ITEMS) : [];
  } catch {
    return [];
  }
}

function write(key, items) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    /* almacenamiento bloqueado: el historial queda solo en memoria */
  }
}

export default SpinHistory;
