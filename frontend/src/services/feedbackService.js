import api from "./api.js";

/**
 * Manda un comentario (idea, error u otro). Llega por mail a quien mantiene la página.
 * Quién lo manda lo pone el backend con la sesión de Steam (sin sesión llega como anónimo).
 */
export async function sendFeedback({ kind, message, website }) {
  await api.post("/feedback", { kind, message, page: window.location.hash || "#/", website });
}
