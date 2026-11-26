import { matchesFilters, pickWeighted } from "./libraryFilters.js";

/**
 * Modo streamer: la ruleta sola, para una fuente de navegador de OBS (o una captura de ventana).
 * Todo se configura en la dirección, así el streamer la pega una vez y queda:
 *
 *   /obs?perfil=<SteamID, vanity o link>&filtro=sin-jugar&fondo=verde&sonido=0
 *   /obs?demo=1                        (con la biblioteca de ejemplo, para probar)
 *
 * Sin perfil ni demo, /obs es la página que explica cómo armarla (StreamerPage).
 */

/** Qué juegos entran: los mismos filtros de horas jugadas que la ruleta. */
export const OVERLAY_FILTERS = {
  todos: "all",
  "sin-jugar": "zero",
  "menos-2h": "under2",
};
/** Fondo de la página: transparente para OBS, verde para recortarlo con un filtro de croma. */
export const OVERLAY_BACKGROUNDS = ["transparente", "verde", "oscuro"];
/** Los últimos ganadores no vuelven a salir enseguida (en vivo, repetir queda mal). */
export const RECENT_WINNERS = 5;

const PROFILE_URL = /steamcommunity\.com\/(?:id|profiles)\/([^/?#\s]+)/i;

/** "https://steamcommunity.com/id/gaben/" → "gaben". Lo demás se deja como está (sin espacios ni barras finales). */
export function steamIdFromInput(text = "") {
  const value = text.trim();
  const match = value.match(PROFILE_URL);
  return (match ? match[1] : value).replace(/\/+$/, "");
}

/** Las opciones de la dirección, con valores por defecto si faltan o no se entienden. */
export function readOverlayOptions(search = "") {
  const params = new URLSearchParams(search);
  const filter = params.get("filtro");
  const background = params.get("fondo");
  return {
    profile: steamIdFromInput(params.get("perfil") ?? ""),
    demo: params.get("demo") === "1",
    filter: filter in OVERLAY_FILTERS ? filter : "todos",
    background: OVERLAY_BACKGROUNDS.includes(background) ? background : "transparente",
    sound: params.get("sonido") !== "0",
  };
}

/** ¿La dirección es la de la superposición (y no la página que explica cómo armarla)? */
export function isOverlayLocation({ pathname, search }) {
  if (pathname.replace(/\/+$/, "") !== "/obs") return false;
  const options = readOverlayOptions(search);
  return Boolean(options.profile) || options.demo;
}

/** La dirección para pegar en OBS. Solo lleva lo que no es el valor por defecto. */
export function overlayUrl(origin, { profile = "", demo = false, filter = "todos", background = "transparente", sound = true } = {}) {
  const params = new URLSearchParams();
  const id = steamIdFromInput(profile);
  if (id) params.set("perfil", id);
  else if (demo) params.set("demo", "1");
  if (filter !== "todos" && filter in OVERLAY_FILTERS) params.set("filtro", filter);
  if (background !== "transparente" && OVERLAY_BACKGROUNDS.includes(background)) params.set("fondo", background);
  if (!sound) params.set("sonido", "0");
  const query = params.toString();
  return `${origin}/obs${query ? `?${query}` : ""}`;
}

/**
 * Los juegos que pueden salir en vivo. Siempre sin contenido +18 ni programas (Soundpad,
 * Wallpaper Engine…), y sin los que ocultaste.
 */
export function overlayPool(games, filter = "todos") {
  const playtimeFilter = OVERLAY_FILTERS[filter] ?? "all";
  return games
    .filter((game) => matchesFilters(game, { playtimeFilter, hideAdult: true, hideSoftware: true }))
    .map((game) => ({ appid: game.appid, name: game.name, image: game.image ?? game.header_image }));
}

/** El ganador, sin repetir los últimos (salvo que no quede otro). */
export function pickWinner(pool, recent = [], random = Math.random) {
  const fresh = pool.filter((game) => !recent.includes(game.appid));
  return pickWeighted(fresh.length ? fresh : pool, undefined, random);
}
