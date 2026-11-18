import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // El frontend y la API comparten origen: /api se reenvía al backend de FastAPI.
    // Así no hace falta CORS en desarrollo y el login con Steam vuelve al mismo puerto.
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
