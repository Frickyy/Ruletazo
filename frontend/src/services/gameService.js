import api from "./api.js";

function buildParams({ steamId, friendSteamId, collection, genre, search, sortBy, sortDirection, playtimeFilter } = {}) {
  const params = {};
  if (steamId) params.steamid = steamId;
  if (friendSteamId) params.friend_steamid = Array.isArray(friendSteamId) ? friendSteamId.join(",") : friendSteamId;
  if (collection) params.collection = collection;
  if (genre) params.genre = genre;
  if (search) params.search = search;
  if (sortBy) params.sort_by = sortBy;
  if (sortDirection) params.sort_direction = sortDirection;
  if (playtimeFilter) params.playtime_filter = playtimeFilter;
  return params;
}

/** Ficha completa del juego que frenó en el rodillo. Sin steamId usa la biblioteca de ejemplo. */
export async function fetchGameDetails({ steamId, friendSteamId, appid }) {
  const params = { ...buildParams({ steamId, friendSteamId }), appid };
  const { data } = await api.get("/games/details", { params, timeout: 60000 });
  return data;
}

/** El juego del día de la comunidad y cuántos jugadores de Ruletazo lo tienen. */
export async function fetchDailyGame() {
  const { data } = await api.get("/games/daily");
  return data;
}

/** Biblioteca completa (cacheada), con los mismos filtros que la ruleta. */
export async function fetchLibrary(options = {}) {
  const timeout = options.sortBy === "price" || options.sortBy === "release_date" ? 120000 : undefined;
  const { data } = await api.get("/games/library", { params: buildParams(options), timeout });
  return data;
}

export async function fetchClassificationStatus(steamId) {
  const { data } = await api.get("/games/library/classification-status", {
    params: { steamid: steamId },
  });
  return data;
}

// Clasificar un lote puede tardar (llama a 3 APIs externas por juego, de a uno);
// se le da más tiempo que al resto de los pedidos para que no corte antes de tiempo.
export async function classifyLibraryBatch(steamId, limit = 100) {
  const { data } = await api.post("/games/library/classify", null, {
    params: { steamid: steamId, limit },
    timeout: 60000,
  });
  return data;
}

export async function addFavorite(steamId, appid) {
  const { data } = await api.post("/games/favorites", null, { params: { steamid: steamId, appid } });
  return data;
}

export async function removeFavorite(steamId, appid) {
  const { data } = await api.delete("/games/favorites", { params: { steamid: steamId, appid } });
  return data;
}

// Segunda pasada de la clasificación: la duración de IGDB de toda la biblioteca y tu progreso de logros.
export async function enrichLibraryBatch(steamId, limit = 5) {
  const { data } = await api.post("/games/library/enrich", null, { params: { steamid: steamId, limit }, timeout: 90000 });
  return data;
}

/** state: "playing" | "finished" | "abandoned" | null (sin estado). */
export async function setGameState(appid, state) {
  const { data } = await api.put("/games/state", { appid, state });
  return data;
}

export async function fetchStateSummary() {
  const { data } = await api.get("/games/states/summary");
  return data;
}

export async function hideGame(appid) {
  const { data } = await api.post("/games/hidden", null, { params: { appid } });
  return data;
}

export async function unhideGame(appid) {
  const { data } = await api.delete("/games/hidden", { params: { appid } });
  return data;
}

export async function fetchPlayerAchievements(steamId, appid) {
  const { data } = await api.get("/games/achievements", { params: { steamid: steamId, appid } });
  return data;
}

/** Usuario de la sesión (cookie firmada). Devuelve null si no inició sesión. */
export async function fetchSession() {
  try {
    const { data } = await api.get("/auth/me");
    return data;
  } catch (err) {
    if (err.response?.status === 401) return null;
    throw err;
  }
}

export async function logoutSession() {
  await api.post("/auth/logout");
}

export async function fetchSteamProfile(steamId) {
  const { data } = await api.get("/auth/profile", { params: { steamid: steamId } });
  return data;
}
