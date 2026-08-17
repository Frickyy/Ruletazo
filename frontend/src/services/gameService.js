import api from "./api.js";

function buildParams({ steamId, friendSteamId, collection, genre } = {}) {
  const params = {};
  if (steamId) params.steamid = steamId;
  if (friendSteamId) params.friend_steamid = friendSteamId;
  if (collection) params.collection = collection;
  if (genre) params.genre = genre;
  return params;
}

/** Juego aleatorio del pool filtrado (colección/género/familia). Sin steamId usa el mock. */
export async function fetchRandomGame(options = {}) {
  const { data } = await api.get("/games/random", { params: buildParams(options) });
  return data;
}

/** Biblioteca completa (cacheada), con los mismos filtros que la ruleta. */
export async function fetchLibrary(options = {}) {
  const { data } = await api.get("/games/library", { params: buildParams(options) });
  return data;
}

/** Géneros ya clasificados entre los juegos de la biblioteca, para armar el filtro. */
export async function fetchGenres(options = {}) {
  const { data } = await api.get("/games/genres", { params: buildParams(options) });
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
export async function classifyLibraryBatch(steamId, limit = 10) {
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
