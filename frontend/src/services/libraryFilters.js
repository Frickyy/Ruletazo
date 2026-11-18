/**
 * Filtros y orden de la biblioteca, en el navegador. La biblioteca se pide una sola vez
 * (ver useLibrary) y tanto la ruleta como la página Biblioteca filtran sobre esa lista:
 * cambiar un filtro es instantáneo, sin volver a pedir nada al backend.
 */

// "Abandonados": con horas jugadas, pero sin tocarlos hace más de esto.
export const STALE_DAYS = 180;

export const PLAYTIME_OPTIONS = [
  { id: "all", label: "Toda la biblioteca" },
  { id: "zero", label: "0 horas" },
  { id: "under2", label: "Menos de 2 h" },
  { id: "stale", label: "Abandonados", title: `Jugados, pero no en los últimos ${STALE_DAYS / 30} meses` },
];

// Según HowLongToBeat (historia principal). Los juegos sin dato quedan fuera al filtrar por duración.
export const DURATION_OPTIONS = [
  { id: "any", label: "Cualquier duración" },
  { id: "short", label: "Cortos (menos de 10 h)", max: 10 },
  { id: "medium", label: "Medianos (10 a 30 h)", min: 10, max: 30 },
  { id: "long", label: "Largos (más de 30 h)", min: 30 },
];

export const SORT_OPTIONS = [
  { id: "name", label: "Nombre" },
  { id: "playtime", label: "Horas jugadas" },
  { id: "last_played", label: "Última vez jugado" },
  { id: "duration", label: "Duración (HLTB)" },
  { id: "price", label: "Precio" },
  { id: "release_date", label: "Fecha de salida" },
];

/**
 * ¿El juego pasa los filtros?
 * - collection: "all" | "favorites" | "hidden" (los ocultos solo aparecen en "hidden")
 * - hideAdult: oculta contenido +18 (según la tienda o, sin datos, por el nombre)
 */
export function matchesFilters(game, filters = {}, now = Date.now()) {
  const { collection = "all", genre = "", playtimeFilter = "all", duration = "any", hideAdult = false, search = "" } = filters;

  if (collection === "hidden") {
    if (!game.is_hidden) return false;
  } else if (game.is_hidden) {
    return false;
  }
  if (collection === "favorites" && !game.is_favorite) return false;
  if (hideAdult && game.is_adult) return false;
  if (genre && !(game.genres ?? []).includes(genre)) return false;
  if (search && !game.name.toLocaleLowerCase("es").includes(search.trim().toLocaleLowerCase("es"))) return false;

  const minutes = game.playtime_forever_minutes ?? 0;
  if (playtimeFilter === "zero" && minutes !== 0) return false;
  if (playtimeFilter === "under2" && minutes >= 120) return false;
  if (playtimeFilter === "stale" && !isStale(game, now)) return false;

  const range = DURATION_OPTIONS.find((option) => option.id === duration);
  if (range && range.id !== "any") {
    const hours = game.hltb_main_hours;
    if (hours == null) return false;
    if (range.min != null && hours < range.min) return false;
    if (range.max != null && hours >= range.max) return false;
  }
  return true;
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
  duration: (game) => game.hltb_main_hours ?? null,
  price: (game) => game.price_cents ?? null,
  release_date: (game) => game.release_date || null,
};

/** Géneros presentes en la biblioteca, ordenados alfabéticamente. */
export function genresOf(games) {
  return [...new Set(games.flatMap((game) => game.genres ?? []))].sort((a, b) => a.localeCompare(b, "es"));
}
