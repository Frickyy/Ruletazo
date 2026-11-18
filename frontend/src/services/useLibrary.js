import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../i18n/index.js";
import { classifyLibraryBatch, enrichLibraryBatch, fetchClassificationStatus, fetchLibrary } from "./gameService.js";

// Primera pasada (datos de la tienda): de a 100 juegos, Steam los manda de a 50 por pedido.
const CLASSIFY_BATCH_SIZE = 100;
// Segunda pasada (duración y logros): de a un juego en el backend, así que tandas chicas.
const ENRICH_BATCH_SIZE = 5;
const PAUSE_BETWEEN_BATCHES_MS = 800;
// Cada cuántas tandas de la segunda pasada se vuelve a pedir la biblioteca.
const REFRESH_EVERY_ENRICH_BATCHES = 6;

/**
 * La biblioteca del usuario (más la de su familia), pedida una sola vez y compartida por la
 * ruleta y la página Biblioteca, que filtran en el navegador.
 *
 * Además completa en segundo plano lo que falte, en dos pasadas:
 * 1. "store": género, sinopsis, precio, portada, modos de juego. Rápida (50 juegos por pedido).
 * 2. "enrich": duración de HowLongToBeat y tu progreso de logros. Lenta (de a un juego).
 */
export function useLibrary(steamId, friendSteamId) {
  const [games, setGames] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [error, setError] = useState(null);
  // { phase: "store" | "enrich" | "done", classified, total, withDuration, running }
  const [classification, setClassification] = useState(null);
  const [paused, setPaused] = useState(false);
  // Se incrementa para volver a correr la clasificación/enriquecimiento (p. ej. al activar logros).
  const [enrichRun, setEnrichRun] = useState(0);
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
        setError(err.response?.data?.detail ?? t("No se pudo cargar la biblioteca. ¿El perfil es público?"));
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

  useEffect(() => {
    if (!steamId || status !== "ready" || paused) return undefined;
    let cancelled = false;
    const pause = () => new Promise((resolve) => setTimeout(resolve, PAUSE_BETWEEN_BATCHES_MS));
    const stop = () => {
      if (!cancelled) setClassification((current) => (current ? { ...current, running: false } : current));
    };

    (async () => {
      let progress;
      try {
        progress = await fetchClassificationStatus(steamId);
      } catch {
        return;
      }
      if (cancelled) return;
      const base = { classified: progress.classified, total: progress.total, withDuration: progress.with_duration ?? 0 };

      // 1) Datos de la tienda.
      let remaining = progress.total - progress.classified;
      setClassification({ ...base, phase: remaining > 0 ? "store" : "enrich", running: true });
      while (!cancelled && remaining > 0) {
        let result;
        try {
          result = await classifyLibraryBatch(steamId, CLASSIFY_BATCH_SIZE);
        } catch {
          return stop();
        }
        if (cancelled) return;
        remaining = result.remaining;
        setClassification((current) => ({ ...current, classified: result.total - result.remaining, total: result.total }));
        if (result.failed) return stop(); // Steam no respondió: se reintenta la próxima vez
        await pause();
      }
      if (cancelled) return;
      if (progress.total - progress.classified > 0) await reload({ silent: true });

      // 2) Duración y logros.
      setClassification((current) => ({ ...current, phase: "enrich" }));
      let batches = 0;
      for (;;) {
        if (cancelled) return;
        let result;
        try {
          result = await enrichLibraryBatch(steamId, ENRICH_BATCH_SIZE);
        } catch {
          return stop();
        }
        if (cancelled) return;
        batches += 1;
        if (result.processed === 0 || result.remaining === 0) break;
        if (batches % REFRESH_EVERY_ENRICH_BATCHES === 0) {
          const latest = await fetchClassificationStatus(steamId).catch(() => null);
          if (latest && !cancelled) setClassification((current) => ({ ...current, withDuration: latest.with_duration ?? current.withDuration }));
          await reload({ silent: true });
        }
        // Un servicio externo nos pausó (rate limit): se sigue la próxima vez que abras la app.
        if (result.paused) return stop();
        await pause();
      }
      const latest = await fetchClassificationStatus(steamId).catch(() => null);
      if (cancelled) return;
      await reload({ silent: true });
      setClassification((current) => ({
        ...current,
        withDuration: latest?.with_duration ?? current.withDuration,
        phase: "done",
        running: false,
      }));
    })();

    return () => {
      cancelled = true;
    };
    // `reload` cambia con los mismos datos que ya están en las dependencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steamId, status === "ready", paused, enrichRun]);

  /** Vuelve a correr la segunda pasada (duración y logros) aunque ya haya terminado. */
  const restartEnrichment = useCallback(() => setEnrichRun((run) => run + 1), []);

  /** Cambia campos de un juego en la lista (favorito, oculto, estado…) sin volver a pedirla. */
  const updateGame = useCallback((appid, patch) => {
    setGames((current) => current.map((game) => (game.appid === appid ? { ...game, ...patch } : game)));
  }, []);

  return {
    games,
    status,
    error,
    reload,
    restartEnrichment,
    updateGame,
    classification: classification && { ...classification, paused },
    setClassificationPaused: setPaused,
  };
}
