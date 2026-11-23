import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// URL pública del sitio (ej. https://ruletazo.app), para las etiquetas de vista previa de
// index.html: WhatsApp, Discord y X piden la imagen con URL absoluta. Sin SITE_URL quedan
// rutas relativas, que alcanzan en desarrollo.
const siteUrl = (process.env.SITE_URL ?? "").trim().replace(/\/+$/, "");

const siteUrlPlugin = {
  name: "site-url",
  transformIndexHtml: (html) => html.replaceAll("__SITE_URL__", siteUrl),
};

export default defineConfig({
  plugins: [react(), siteUrlPlugin],
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
