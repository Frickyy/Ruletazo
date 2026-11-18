import api from "./api.js";

/** Perfil de alguien (o el tuyo con tu SteamID). 404 si es privado o no existe. */
export async function fetchProfile(steamId) {
  const { data } = await api.get(`/profiles/${encodeURIComponent(steamId)}`);
  return data;
}

/** { is_public?, track_achievements? } */
export async function updateMyPreferences(preferences) {
  const { data } = await api.put("/profiles/me", preferences);
  return data;
}

/** Juegos que tenés vos y el dueño del perfil. */
export async function fetchGamesInCommon(steamId) {
  const { data } = await api.get(`/profiles/${encodeURIComponent(steamId)}/common`, { timeout: 60000 });
  return data;
}

/** Configuración pública: links para apoyar, tiendas con afiliados, si HowLongToBeat está activo. */
export async function fetchPublicConfig() {
  const { data } = await api.get("/config");
  return data;
}

/** Borra todos tus datos de la página y cierra la sesión. */
export async function deleteMyData() {
  await api.delete("/profiles/me");
}
