import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Permite abrir el servidor de desarrollo a través de un túnel de Cloudflare (p. ej. desde el celular).
    allowedHosts: [".trycloudflare.com"],
    // El frontend y la API comparten origen: /api se reenvía al backend de FastAPI.
    // Así no hace falta CORS en desarrollo y el login con Steam vuelve al mismo puerto.
    // changeOrigin: false conserva el host del navegador (localhost:5173), así la vuelta del
    // login de Steam también pasa por este puerto en vez de ir directo al backend.
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: false },
    },
  },
});
