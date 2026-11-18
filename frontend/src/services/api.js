import axios from "axios";

// Instancia central de axios: si mañana cambia la URL del backend (deploy, docker, etc.)
// solo se toca este archivo, ningún componente ni hook depende de la URL directamente.
// Por defecto usa "/api", que en desarrollo Vite redirige al backend (ver vite.config.js).
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "/api",
  timeout: 30000,
});

export default api;
