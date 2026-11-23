/**
 * Imagen para compartir el juego que salió (1080×1920, formato historia de Instagram/WhatsApp).
 *
 * Igual que la de "Compartir mi año": se dibuja en un canvas con la portada del CDN de Steam (que
 * permite exportarla). Si la portada no carga, queda un recuadro vacío en vez de fallar.
 */

import { t } from "../i18n/index.js";
import { fit, loadImage, roundRect, roundRectPath } from "./yearCard.js";

const WIDTH = 1080;
const HEIGHT = 1920;
const PAD = 80;
const ACCENT = "#ff5c9a";
const BG = "#131211";
const SURFACE = "#1d1c1a";
const TEXT = "#f4efe9";
const MUTED = "#a39c93";
const DISPLAY = '"Space Grotesk", "Segoe UI", sans-serif';
const BODY = '"Inter", "Segoe UI", sans-serif';

/** Parte el nombre en hasta dos líneas que entren en `maxWidth`. */
export function wrapTitle(ctx, text, maxWidth) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= 2) return lines;
  return [lines[0], fit(ctx, lines.slice(1).join(" "), maxWidth)];
}

export async function renderResultCard(game) {
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const glow = ctx.createRadialGradient(WIDTH / 2, 820, 0, WIDTH / 2, 820, 900);
  glow.addColorStop(0, "rgba(255, 92, 154, 0.30)");
  glow.addColorStop(1, "rgba(255, 92, 154, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = ACCENT;
  ctx.font = `700 34px ${DISPLAY}`;
  ctx.fillText("RULETAZO", PAD, PAD + 40);

  ctx.fillStyle = TEXT;
  ctx.font = `700 120px ${DISPLAY}`;
  ctx.fillText(t("Me tocó"), PAD, 420);

  // Portada (460×215 en Steam) a todo el ancho, con borde rosa como en el rodillo.
  const coverW = WIDTH - PAD * 2;
  const coverH = Math.round(coverW * (215 / 460));
  const coverY = 520;
  ctx.save();
  ctx.shadowColor = "rgba(255, 92, 154, 0.55)";
  ctx.shadowBlur = 60;
  roundRect(ctx, PAD - 6, coverY - 6, coverW + 12, coverH + 12, 34, ACCENT);
  ctx.restore();
  const cover = await loadImage(game.header_image);
  ctx.save();
  roundRectPath(ctx, PAD, coverY, coverW, coverH, 28);
  ctx.clip();
  if (cover) ctx.drawImage(cover, PAD, coverY, coverW, coverH);
  else {
    ctx.fillStyle = SURFACE;
    ctx.fillRect(PAD, coverY, coverW, coverH);
  }
  ctx.restore();

  // Nombre del juego
  ctx.fillStyle = TEXT;
  ctx.font = `700 76px ${DISPLAY}`;
  const titleLines = wrapTitle(ctx, game.name, WIDTH - PAD * 2);
  let y = coverY + coverH + 140;
  for (const line of titleLines) {
    ctx.fillText(line, PAD, y);
    y += 88;
  }

  // Datos rápidos: duración y reseñas, si se conocen.
  const facts = [];
  if (game.duration_hours) facts.push(t("{hours} h para terminarlo", { hours: Math.max(1, Math.round(game.duration_hours)) }));
  if (game.review_score_desc) facts.push(t(game.review_score_desc));
  ctx.font = `600 40px ${BODY}`;
  let x = PAD;
  y += 30;
  for (const fact of facts) {
    const width = ctx.measureText(fact).width + 56;
    if (x + width > WIDTH - PAD) {
      x = PAD;
      y += 96;
    }
    roundRect(ctx, x, y - 52, width, 76, 38, SURFACE);
    ctx.fillStyle = TEXT;
    ctx.fillText(fact, x + 28, y);
    x += width + 20;
  }

  // Pie: la invitación y la dirección.
  ctx.fillStyle = MUTED;
  ctx.font = `500 44px ${BODY}`;
  ctx.fillText(t("¿Qué te toca a vos?"), PAD, HEIGHT - PAD - 90);
  ctx.fillStyle = ACCENT;
  ctx.font = `700 64px ${DISPLAY}`;
  ctx.fillText("ruletazo.app", PAD, HEIGHT - PAD);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(t("No se pudo generar la imagen.")))), "image/png");
  });
}
