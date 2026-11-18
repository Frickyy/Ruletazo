import axios from "axios";
import { translateServerMessage } from "../i18n/index.js";

// Instancia central de axios: si mañana cambia la URL del backend (deploy, docker, etc.)
// solo se toca este archivo, ningún componente ni hook depende de la URL directamente.
// Por defecto usa "/api", que en desarrollo Vite redirige al backend (ver vite.config.js).
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "/api",
  timeout: 30000,
  // La sesión de Steam viaja en una cookie HttpOnly firmada por el backend.
  withCredentials: true,
});

// Los mensajes de error del backend llegan en español: se traducen acá, una sola vez, para que
// todos los componentes que muestran `err.response.data.detail` los vean en el idioma elegido.
api.interceptors.response.use(undefined, (error) => {
  const data = error?.response?.data;
  if (data && typeof data.detail === "string") data.detail = translateServerMessage(data.detail);
  return Promise.reject(error);
});

export default api;
