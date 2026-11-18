import { useCallback, useEffect, useRef, useState } from "react";
import { classifyLibraryBatch, fetchClassificationStatus, fetchLibrary } from "./gameService.js";

// Juegos por tanda de clasificación y pausa entre tandas (la tienda de Steam limita los pedidos).
const CLASSIFY_BATCH_SIZE = 4; // cada juego tarda unos segundos (tienda, reseñas, HLTB, logros)
const PAUSE_BETWEEN_BATCHES_MS = 1500;
// Cada cuántas tandas se vuelve a pedir la biblioteca para que aparezcan géneros, duración, etc.
const REFRESH_EVERY_BATCHES = 3;

/**
 * La biblioteca del usuario (más la de su familia), pedida una sola vez y compartida por la
 * ruleta y la página Biblioteca, que filtran en el navegador.
 *
 * Además clasifica en segundo plano los juegos que todavía no tienen datos de la tienda
 * (género, sinopsis, duración, reseñas…): antes había que tocar un botón en Biblioteca y,
 * hasta hacerlo, el filtro de género quedaba vacío.
 */
export function useLibrary(steamId, friendSteamId) {
  const [games, setGames] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [error, setError] = useState(null);
  const [classification, setClassification] = useState(null); // { classified, total, running, paused }
  const [paused, setPaused] = useState(false);
  const requestId = useRef(0);

  const reload = useCallback(
    async ({ silent = false } = {}) => {
      if (!steamId) return;
      const id = ++requestId.current;
      if (!silent) setStatus("loading");
      try {
        const next = await fetchLibrary({ steamId, friendSteamId });
        if (id !== requestId.current) return;
        setGames(next);
        setStatus("ready");
        setError(null);
      } catch (err) {
        if (id !== requestId.current || silent) return;
        setGames([]);
        setStatus("error");
        setError(err.response?.data?.detail ?? "No se pudo cargar la biblioteca. ¿El perfil es público?");
      }
    },
    [steamId, friendSteamId],
  );

  useEffect(() => {
    if (!steamId) {
      requestId.current += 1;
      setGames([]);
      setStatus("idle");
      setClassification(null);
      return;
    }
    reload();
  }, [steamId, friendSteamId, reload]);

  // Clasificación en segundo plano: tandas chicas hasta que no quede nada pendiente.
  useEffect(() => {
    if (!steamId || status !== "ready" || paused) return undefined;
    let cancelled = false;

    (async () => {
      let progress;
      try {
        progress = await fetchClassificationStatus(steamId);
      } catch {
        return;
      }
      let remaining = progress.total - progress.classified;
      if (cancelled) return;
      setClassification({ classified: progress.classified, total: progress.total, running: remaining > 0 });
      let batches = 0;
      while (!cancelled && remaining > 0) {
        try {
          const result = await classifyLibraryBatch(steamId, CLASSIFY_BATCH_SIZE);
          remaining = result.remaining;
          batches += 1;
          if (cancelled) return;
          setClassification({ classified: result.total - result.remaining, total: result.total, running: remaining > 0 });
          if (batches % REFRESH_EVERY_BATCHES === 0 || remaining === 0) await reload({ silent: true });
        } catch {
          // Steam cortó o el backend no responde: se reintenta más tarde, sin insistir.
          if (!cancelled) setClassification((current) => (current ? { ...current, running: false } : current));
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, PAUSE_BETWEEN_BATCHES_MS));
      }
    })();

    return () => {
      cancelled = true;
    };
    // `reload` cambia con los mismos datos que ya están en las dependencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steamId, status === "ready", paused]);

  /** Cambia campos de un juego en la lista (favorito, oculto…) sin volver a pedirla. */
  const updateGame = useCallback((appid, patch) => {
    setGames((current) => current.map((game) => (game.appid === appid ? { ...game, ...patch } : game)));
  }, []);

  return {
    games,
    status,
    error,
    reload,
    updateGame,
    classification: classification && { ...classification, paused },
    setClassificationPaused: setPaused,
  };
}
