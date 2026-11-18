import api from "./api.js";

export async function searchForumGames(query) {
  const { data } = await api.get("/forum/search", { params: { q: query } });
  return data;
}

export async function fetchRecentActivity() {
  const { data } = await api.get("/forum/recent");
  return data;
}

export async function fetchForumGame(appid) {
  const { data } = await api.get(`/forum/games/${appid}`);
  return data;
}

export async function fetchForumReviews(appid) {
  const { data } = await api.get(`/forum/games/${appid}/reviews`);
  return data;
}

export async function saveForumReview(appid, { score, body }) {
  const { data } = await api.put(`/forum/games/${appid}/reviews`, { score, body });
  return data;
}

export async function deleteForumReview(appid) {
  await api.delete(`/forum/games/${appid}/reviews`);
}

export async function fetchForumThreads(appid) {
  const { data } = await api.get(`/forum/games/${appid}/threads`);
  return data;
}

export async function createForumThread(appid, { title, body }) {
  const { data } = await api.post(`/forum/games/${appid}/threads`, { title, body });
  return data;
}

export async function fetchForumThread(threadId) {
  const { data } = await api.get(`/forum/threads/${threadId}`);
  return data;
}

export async function replyToForumThread(threadId, body) {
  const { data } = await api.post(`/forum/threads/${threadId}/posts`, { body });
  return data;
}

export async function deleteForumThread(threadId) {
  await api.delete(`/forum/threads/${threadId}`);
}

export async function deleteForumPost(postId) {
  await api.delete(`/forum/posts/${postId}`);
}

/** Mensaje de error legible: el backend manda el motivo en `detail`. */
export function forumErrorMessage(err, fallback = "Algo salió mal. Probá de nuevo.") {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return "Revisá los datos: hay campos vacíos o demasiado largos.";
  if (err?.request && !err.response) return "No se pudo conectar con el backend. ¿Está corriendo?";
  return fallback;
}
