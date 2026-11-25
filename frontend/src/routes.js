import { useEffect, useState } from "react";

/**
 * Rutas con direcciones normales (/foro/juego/367520): el botón Atrás funciona, se puede recargar
 * sin perder la sección, se comparten links limpios y Google puede mostrar cada sección por
 * separado (con hash veía todo como la portada). El servidor devuelve la página en estas
 * direcciones (backend/app/core/static_files.py).
 *
 *   /  (la ruleta) · /biblioteca · /familia · /foro
 *   /foro/juego/<appid>               reseñas del juego
 *   /foro/juego/<appid>/discusiones   discusiones del juego
 *   /foro/juego/<appid>/hilo/<id>     un hilo
 *   /perfil                           tu perfil
 *   /perfil/<steamid>                 el perfil de otra persona
 *   /sala/<código>                    una sala para elegir en grupo
 *   /privacidad · /terminos
 *
 * Los links viejos con hash (/#/sala/ABC123) siguen andando: al entrar se pasan a la dirección nueva.
 */
const VIEW_SLUGS = {
  roulette: "ruleta",
  library: "biblioteca",
  family: "familia",
  forum: "foro",
  profile: "perfil",
  privacy: "privacidad",
  terms: "terminos",
  room: "sala",
};
const SLUG_VIEWS = Object.fromEntries(Object.entries(VIEW_SLUGS).map(([view, slug]) => [slug, view]));

export function parseRoute(path) {
  const parts = path.split("/").filter(Boolean);
  const view = SLUG_VIEWS[parts[0]] ?? "roulette";
  if (view === "room") {
    return { view, forumTarget: null, roomCode: /^[A-Za-z0-9]{4,12}$/.test(parts[1] ?? "") ? parts[1].toUpperCase() : null };
  }
  if (view === "profile") {
    return { view, forumTarget: null, profileId: /^[\w.-]{2,64}$/.test(parts[1] ?? "") ? parts[1] : null };
  }
  if (view !== "forum" || parts[1] !== "juego") return { view, forumTarget: null };

  const appid = Number(parts[2]);
  if (!Number.isInteger(appid) || appid <= 0) return { view, forumTarget: null };
  if (parts[3] === "hilo" && Number(parts[4]) > 0) {
    return { view, forumTarget: { appid, threadId: Number(parts[4]) } };
  }
  return { view, forumTarget: { appid, tab: parts[3] === "discusiones" ? "threads" : "reviews" } };
}

/** La dirección de una sección. La ruleta es la portada (/), así no hay dos direcciones para lo mismo. */
export function buildPath(view, forumTarget = null, profileId = null) {
  if (view === "roulette" || !VIEW_SLUGS[view]) return "/";
  let path = `/${VIEW_SLUGS[view]}`;
  if ((view === "profile" || view === "room") && profileId) return `${path}/${profileId}`;
  if (view === "forum" && forumTarget?.appid) {
    path += `/juego/${forumTarget.appid}`;
    if (forumTarget.threadId) path += `/hilo/${forumTarget.threadId}`;
    else if (forumTarget.tab === "threads") path += "/discusiones";
  }
  return path;
}

/** La ruta de una dirección; un link viejo con hash (/#/sala/ABC123) cuenta como su dirección nueva. */
export function routeFromLocation({ pathname, hash }) {
  return parseRoute(hash.startsWith("#/") ? hash.slice(1) : pathname);
}

/** La dirección de siempre para una ruta ya leída (ej. /sala/abc234 → /sala/ABC234, /ruleta → /). */
export function pathOfRoute(route) {
  return buildPath(route.view, route.forumTarget, route.profileId ?? route.roomCode);
}

/**
 * Lee la ruta de la barra de direcciones. Si la dirección no es la de siempre (un link viejo con
 * hash, /ruleta, un código de sala en minúsculas, una sección que no existe), la reemplaza sin
 * sumar un paso al historial. Conserva lo que viene después del "?" (la vuelta del login lo usa).
 */
function readLocation() {
  const { pathname, search, hash } = window.location;
  const route = routeFromLocation(window.location);
  const path = pathOfRoute(route);
  const legacy = hash.startsWith("#/");
  if (path !== pathname || legacy) {
    window.history.replaceState(window.history.state, "", path + search + (legacy ? "" : hash));
  }
  return route;
}

/** Ruta actual + función para navegar. `name` del juego no viaja en la URL: se pide al backend. */
export function useRoute() {
  const [route, setRoute] = useState(readLocation);

  useEffect(() => {
    // Atrás/Adelante, o un link viejo con hash pegado con la página ya abierta.
    const onLocationChange = () =>
      setRoute((current) => {
        const next = readLocation();
        // Conserva el nombre del juego si se sigue en el mismo, así no parpadea "Juego".
        if (next.forumTarget && current.forumTarget?.appid === next.forumTarget.appid && current.forumTarget.name) {
          next.forumTarget.name = current.forumTarget.name;
        }
        return next;
      });
    window.addEventListener("popstate", onLocationChange);
    window.addEventListener("hashchange", onLocationChange);
    return () => {
      window.removeEventListener("popstate", onLocationChange);
      window.removeEventListener("hashchange", onLocationChange);
    };
  }, []);

  function navigate(view, forumTarget = null, profileId = null) {
    const path = buildPath(view, forumTarget, profileId);
    // El nombre del juego no está en la URL; se conserva en memoria mientras dure la navegación.
    // El tercer parámetro es el SteamID en /perfil y el código en /sala.
    setRoute({
      view,
      forumTarget,
      profileId: view === "profile" ? profileId : undefined,
      roomCode: view === "room" ? profileId : undefined,
    });
    if (window.location.pathname !== path || window.location.hash) window.history.pushState(null, "", path);
  }

  return [route, navigate];
}
