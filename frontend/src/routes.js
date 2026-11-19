import { useEffect, useState } from "react";

/**
 * Rutas con hash (#/foro/juego/367520) para que el botón Atrás funcione, se pueda recargar
 * sin perder la sección y se puedan compartir links del foro. Con hash no hace falta que el
 * servidor conozca las rutas: cualquier hosting estático sirve index.html y listo.
 *
 *   #/ruleta · #/biblioteca · #/familia · #/foro
 *   #/foro/juego/<appid>               reseñas del juego
 *   #/foro/juego/<appid>/discusiones   discusiones del juego
 *   #/foro/juego/<appid>/hilo/<id>     un hilo
 */
const VIEW_SLUGS = { roulette: "ruleta", library: "biblioteca", family: "familia", forum: "foro" };
const SLUG_VIEWS = Object.fromEntries(Object.entries(VIEW_SLUGS).map(([view, slug]) => [slug, view]));

export function parseRoute(hash) {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const view = SLUG_VIEWS[parts[0]] ?? "roulette";
  if (view !== "forum" || parts[1] !== "juego") return { view, forumTarget: null };

  const appid = Number(parts[2]);
  if (!Number.isInteger(appid) || appid <= 0) return { view, forumTarget: null };
  if (parts[3] === "hilo" && Number(parts[4]) > 0) {
    return { view, forumTarget: { appid, threadId: Number(parts[4]) } };
  }
  return { view, forumTarget: { appid, tab: parts[3] === "discusiones" ? "threads" : "reviews" } };
}

export function buildHash(view, forumTarget = null) {
  let hash = `#/${VIEW_SLUGS[view] ?? VIEW_SLUGS.roulette}`;
  if (view === "forum" && forumTarget?.appid) {
    hash += `/juego/${forumTarget.appid}`;
    if (forumTarget.threadId) hash += `/hilo/${forumTarget.threadId}`;
    else if (forumTarget.tab === "threads") hash += "/discusiones";
  }
  return hash;
}

/** Ruta actual + función para navegar. `name` del juego no viaja en la URL: se pide al backend. */
export function useHashRoute() {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));

  useEffect(() => {
    const onHashChange = () =>
      setRoute((current) => {
        const next = parseRoute(window.location.hash);
        // Conserva el nombre del juego si se sigue en el mismo, así no parpadea "Juego".
        if (next.forumTarget && current.forumTarget?.appid === next.forumTarget.appid && current.forumTarget.name) {
          next.forumTarget.name = current.forumTarget.name;
        }
        return next;
      });
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function navigate(view, forumTarget = null) {
    const hash = buildHash(view, forumTarget);
    // El nombre del juego no está en la URL; se conserva en memoria mientras dure la navegación.
    setRoute({ view, forumTarget });
    if (window.location.hash !== hash) window.location.hash = hash;
  }

  return [route, navigate];
}
