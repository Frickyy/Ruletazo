/**
 * Filtros y orden de la biblioteca, en el navegador. La biblioteca se pide una sola vez
 * (ver useLibrary) y tanto la ruleta como la página Biblioteca filtran sobre esa lista:
 * cambiar un filtro es instantáneo, sin volver a pedir nada al backend.
 */

import { tk } from "../i18n/index.js";

// "Abandonados": con horas jugadas, pero sin tocarlos hace más de esto.
export const STALE_DAYS = 180;

export const PLAYTIME_OPTIONS = [
  { id: "all", label: tk("Toda la biblioteca") },
  { id: "zero", label: tk("0 horas") },
  { id: "under2", label: tk("Menos de 2 h") },
  { id: "stale", label: tk("Abandonados"), title: tk("Jugados, pero no en los últimos 6 meses") /* STALE_DAYS / 30 */ },
];

// Según la duración de cada juego (IGDB o la comunidad). Los juegos sin dato quedan fuera al filtrar por duración.
export const DURATION_OPTIONS = [
  { id: "any", label: tk("Cualquier duración") },
  { id: "short", label: tk("Cortos (menos de 10 h)"), max: 10 },
  { id: "medium", label: tk("Medianos (10 a 30 h)"), min: 10, max: 30 },
  { id: "long", label: tk("Largos (más de 30 h)"), min: 30 },
];

// Modos de juego según la tienda.
export const MODE_OPTIONS = [
  { id: "any", label: tk("Cualquier modo") },
  { id: "single", label: tk("Un jugador") },
  { id: "coop", label: tk("Cooperativos") },
  { id: "multi", label: tk("Multijugador") },
  { id: "local", label: tk("Pantalla compartida") },
];

export const STATE_LABELS = { playing: tk("Jugando"), finished: tk("Terminado"), abandoned: tk("Abandonado") };

export const STATE_OPTIONS = [
  { id: "any", label: tk("Cualquier estado") },
  { id: "none", label: tk("Sin estado") },
  { id: "playing", label: tk("Jugando") },
  { id: "finished", label: tk("Terminados") },
  { id: "abandoned", label: tk("Abandonados (marcados)") },
];

// "Casi al 100%": te falta poco para tener todos los logros.
export const NEAR_COMPLETE_RATIO = 0.8;

export const SORT_OPTIONS = [
  { id: "name", label: tk("Nombre") },
  { id: "playtime", label: tk("Horas jugadas") },
  { id: "last_played", label: tk("Última vez jugado") },
  { id: "duration", label: tk("Duración") },
  { id: "achievements", label: tk("Logros (% completado)") },
  { id: "price", label: tk("Precio") },
  { id: "release_date", label: tk("Fecha de salida") },
];

/**
 * ¿El juego pasa los filtros?
 * - collection: "all" | "favorites" | "playing" | "near_complete" | "hidden" (los ocultos solo aparecen en "hidden")
 * - hideAdult: oculta contenido +18 (según la tienda o, sin datos, por el nombre)
 * - hideSoftware: oculta lo que la tienda lista como software (Soundpad, Wallpaper Engine…)
 * - mode: modo de juego (ver MODE_OPTIONS); inCommon: solo los que tenés vos y alguien de tu familia
 * - includeFinished: si es false, los terminados no entran (la ruleta los saca por defecto)
 * - state: filtro por estado de la página Biblioteca (ver STATE_OPTIONS)
 */
// "Juegos basura": los que casi nadie reseñó en Steam o que tienen reseñas negativas. Suelen ser los
// que se compran baratos por los cromos. No cuentan un juego sin datos de la tienda (todavía no se
// sabe cuántas reseñas tiene) ni uno que el usuario marcó como favorito.
export const JUNK_MAX_REVIEWS = 50;
const NEGATIVE_REVIEWS = ["Mayormente negativas", "Negativas", "Muy negativas", "Extremadamente negativas"];

export function isJunk(game) {
  if (!game.store_data || game.is_favorite) return false;
  return (game.review_total ?? 0) < JUNK_MAX_REVIEWS || NEGATIVE_REVIEWS.includes(game.review_score_desc);
}

export function matchesFilters(game, filters = {}, now = Date.now()) {
  const {
    collection = "all",
    genre = "",
    playtimeFilter = "all",
    duration = "any",
    hideAdult = false,
    hideSoftware = false,
    hideJunk = false,
    search = "",
    mode = "any",
    inCommon = false,
    includeFinished = true,
    state = "any",
  } = filters;

  if (collection === "hidden") {
    if (!game.is_hidden) return false;
  } else if (game.is_hidden) {
    return false;
  }
  if (collection === "favorites" && !game.is_favorite) return false;
  if (collection === "playing" && game.state !== "playing") return false;
  if (collection === "near_complete" && !isNearComplete(game)) return false;
  if (!includeFinished && game.state === "finished") return false;
  if (state === "none" && game.state) return false;
  if (!["any", "none"].includes(state) && game.state !== state) return false;
  if (inCommon && game.source !== "both") return false;
  if (mode === "single" && !game.single_player) return false;
  if (mode === "coop" && !game.coop) return false;
  if (mode === "multi" && !game.multiplayer) return false;
  if (mode === "local" && !game.local_multiplayer) return false;
  if (hideAdult && game.is_adult) return false;
  if (hideSoftware && game.is_software) return false;
  if (hideJunk && isJunk(game)) return false;
  if (genre && !(game.genres ?? []).includes(genre)) return false;
  if (search && !game.name.toLocaleLowerCase("es").includes(search.trim().toLocaleLowerCase("es"))) return false;

  const minutes = game.playtime_forever_minutes ?? 0;
  if (playtimeFilter === "zero" && minutes !== 0) return false;
  if (playtimeFilter === "under2" && minutes >= 120) return false;
  if (playtimeFilter === "stale" && !isStale(game, now)) return false;

  const range = DURATION_OPTIONS.find((option) => option.id === duration);
  if (range && range.id !== "any") {
    const hours = game.duration_hours;
    if (hours == null) return false;
    if (range.min != null && hours < range.min) return false;
    if (range.max != null && hours >= range.max) return false;
  }
  return true;
}

export function isNearComplete(game) {
  const { achievements_unlocked: unlocked, achievements_total: total } = game;
  if (!total || unlocked == null || unlocked >= total) return false;
  return unlocked / total >= NEAR_COMPLETE_RATIO;
}

export function achievementRatio(game) {
  return game.achievements_total ? (game.achievements_unlocked ?? 0) / game.achievements_total : null;
}

export function isStale(game, now = Date.now()) {
  if (!game.playtime_forever_minutes || !game.last_played) return false;
  return now - game.last_played * 1000 > STALE_DAYS * 24 * 60 * 60 * 1000;
}

/** Ordena una copia. Los juegos sin el dato (precio, fecha, duración…) van al final en ambos sentidos. */
export function sortGames(games, sortBy = "name", direction = "asc") {
  const value = SORT_VALUES[sortBy] ?? SORT_VALUES.name;
  const factor = direction === "desc" ? -1 : 1;
  const byName = (a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" });
  return [...games].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    if (left == null && right == null) return byName(a, b);
    if (left == null) return 1;
    if (right == null) return -1;
    if (typeof left === "string" && typeof right === "string") {
      // localeCompare ordena la ñ y las tildes como en español ("Ñandú" antes que "Zelda").
      const compared = left.localeCompare(right, "es", { sensitivity: "base" });
      return compared !== 0 ? compared * factor : byName(a, b);
    }
    if (left < right) return -1 * factor;
    if (left > right) return 1 * factor;
    return byName(a, b);
  });
}

const SORT_VALUES = {
  name: (game) => game.name.toLocaleLowerCase("es"),
  playtime: (game) => game.playtime_forever_minutes ?? 0,
  last_played: (game) => game.last_played ?? null,
  duration: (game) => game.duration_hours ?? null,
  achievements: (game) => achievementRatio(game),
  price: (game) => game.price_cents ?? null,
  release_date: (game) => game.release_date || null,
};

/** Géneros presentes en la biblioteca, ordenados alfabéticamente. */
export function genresOf(games) {
  return [...new Set(games.flatMap((game) => game.genres ?? []))].sort((a, b) => a.localeCompare(b, "es"));
}

/**
 * Peso de cada juego en la "ruleta inteligente": todos pueden salir, pero salen más seguido
 * los sin estrenar, los cortos, los bien reseñados, los favoritos y los que estás jugando.
 */
export function smartWeight(game) {
  if (!game) return 1;
  let weight = 1;
  if (!game.playtime_forever_minutes) weight += 1.5;
  if (game.duration_hours != null && game.duration_hours < 15) weight += 1;
  if (/positivas/i.test(game.review_score_desc ?? "") && !/mayormente|mixtas/i.test(game.review_score_desc ?? "")) weight += 1;
  if (game.is_favorite) weight += 1;
  if (game.state === "playing") weight += 1.5;
  return weight;
}

/** Elige uno al azar según `weightOf` (sin pesos = todos con la misma chance). */
export function pickWeighted(items, weightOf = () => 1, random = Math.random) {
  if (items.length === 0) return null;
  const weights = items.map((item) => Math.max(weightOf(item), 0));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return items[Math.floor(random() * items.length)];
  let target = random() * total;
  for (let index = 0; index < items.length; index += 1) {
    target -= weights[index];
    if (target < 0) return items[index];
  }
  return items[items.length - 1];
}

/** Con menos de la mitad de los juegos con duración conocida, el filtro dejaría afuera a casi todos. */
export const MIN_DURATION_COVERAGE = 0.5;

/**
 * Si se muestran el filtro y el orden por duración: cuando al menos la mitad de los juegos tiene el
 * dato (de IGDB o de quienes los terminaron en Ruletazo). Con menos, filtrar por duración dejaría
 * afuera a la mayor parte de la biblioteca sin que se note por qué.
 */
export function durationFilterAvailable(games) {
  if (!games.length) return false;
  const known = games.filter((game) => game.duration_hours != null).length;
  return known / games.length >= MIN_DURATION_COVERAGE;
}
