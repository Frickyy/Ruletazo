/**
 * "Mi pila sin jugar" para compartir: cuántos juegos sin estrenar tenés y cuánto valen hoy en la
 * tienda, con las portadas de los más caros (1080×1920, formato historia). Es la idea con más
 * chances de que se comparta sola: la gente comparte números sobre sí misma.
 */

import { formatNumber, t } from "../i18n/index.js";
import { formatMoney } from "./backlogStats.js";
import { shareWithImage } from "./shareResult.js";
import { loadImage, roundRect, roundRectPath } from "./yearCard.js";

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

export function buildBacklogShareText(stats, siteUrl) {
  const count = formatNumber(stats.unplayed);
  return {
    title: "Ruletazo",
    text:
      stats.valueCents > 0
        ? t("Tengo {count} juegos de Steam sin estrenar que hoy valen {value} en la tienda 💀 ¿Cuánto vale tu pila?", {
            count,
            value: formatMoney(stats.valueCents),
          })
        : t("Tengo {count} juegos de Steam sin estrenar 💀 ¿Cuántos tenés vos?", { count }),
    url: siteUrl,
  };
}

export async function shareBacklog(stats, siteUrl = window.location.origin) {
  return shareWithImage(buildBacklogShareText(stats, siteUrl), () => renderBacklogCard(stats), "ruletazo-mi-pila.png");
}

export async function renderBacklogCard(stats) {
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const glow = ctx.createRadialGradient(WIDTH / 2, 600, 0, WIDTH / 2, 600, 900);
  glow.addColorStop(0, "rgba(255, 92, 154, 0.28)");
  glow.addColorStop(1, "rgba(255, 92, 154, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = ACCENT;
  ctx.font = `700 34px ${DISPLAY}`;
  ctx.fillText("RULETAZO", PAD, PAD + 40);

  ctx.fillStyle = TEXT;
  ctx.font = `700 92px ${DISPLAY}`;
  ctx.fillText(t("Mi pila sin jugar"), PAD, 300);

  // Los dos números grandes: cuántos y cuánto valen.
  ctx.fillStyle = ACCENT;
  ctx.font = `700 220px ${DISPLAY}`;
  ctx.fillText(formatNumber(stats.unplayed), PAD - 8, 560);
  ctx.fillStyle = TEXT;
  ctx.font = `600 52px ${BODY}`;
  ctx.fillText(t("juegos sin estrenar"), PAD, 640);

  let coversY = 740;
  if (stats.valueCents > 0) {
    ctx.fillStyle = TEXT;
    ctx.font = `700 150px ${DISPLAY}`;
    ctx.fillText(formatMoney(stats.valueCents), PAD - 4, 840);
    ctx.fillStyle = MUTED;
    ctx.font = `500 40px ${BODY}`;
    ctx.fillText(t("a precio de hoy en la tienda de Steam"), PAD, 910);
    coversY = 990;
  }

  // Las portadas de los más caros, en dos columnas.
  const gap = 28;
  const coverW = (WIDTH - PAD * 2 - gap) / 2;
  const coverH = Math.round(coverW * (215 / 460));
  const images = await Promise.all(stats.top.map((game) => loadImage(game.header_image)));
  images.forEach((image, index) => {
    const x = PAD + (index % 2) * (coverW + gap);
    const y = coversY + Math.floor(index / 2) * (coverH + gap);
    ctx.save();
    roundRectPath(ctx, x, y, coverW, coverH, 18);
    ctx.clip();
    if (image) ctx.drawImage(image, x, y, coverW, coverH);
    else roundRect(ctx, x, y, coverW, coverH, 18, SURFACE);
    ctx.restore();
  });

  // Pie: la invitación y la dirección.
  ctx.fillStyle = MUTED;
  ctx.font = `500 44px ${BODY}`;
  ctx.fillText(t("¿Cuánto vale la tuya?"), PAD, HEIGHT - PAD - 90);
  ctx.fillStyle = ACCENT;
  ctx.font = `700 64px ${DISPLAY}`;
  ctx.fillText("ruletazo.app", PAD, HEIGHT - PAD);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(t("No se pudo generar la imagen.")))), "image/png");
  });
}
