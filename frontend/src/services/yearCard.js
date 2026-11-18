/**
 * Imagen para compartir el resumen del año (1080×1350, el formato vertical de las redes).
 *
 * Se dibuja en un canvas con los datos del perfil. Las portadas y el avatar salen de los CDN de
 * Steam, que mandan Access-Control-Allow-Origin: *, así el canvas se puede exportar. Si alguna
 * imagen no carga, se dibuja un recuadro vacío en su lugar en vez de fallar.
 */

const WIDTH = 1080;
const HEIGHT = 1350;
const PAD = 72;
const ACCENT = "#ff5c9a";
const BG = "#131211";
const SURFACE = "#1d1c1a";
const TEXT = "#f4efe9";
const MUTED = "#a39c93";
const DISPLAY = '"Space Grotesk", "Segoe UI", sans-serif';
const BODY = '"Inter", "Segoe UI", sans-serif';

export async function renderYearCard(profile) {
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  const year = profile.summary?.year ?? new Date().getFullYear();

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const glow = ctx.createRadialGradient(WIDTH, 0, 0, WIDTH, 0, 900);
  glow.addColorStop(0, "rgba(255, 92, 154, 0.28)");
  glow.addColorStop(1, "rgba(255, 92, 154, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Encabezado
  ctx.fillStyle = ACCENT;
  ctx.font = `700 30px ${DISPLAY}`;
  ctx.fillText("RULETAZO", PAD, PAD + 24);
  ctx.fillStyle = TEXT;
  ctx.font = `700 92px ${DISPLAY}`;
  ctx.fillText(`Mi ${year}`, PAD, PAD + 140);
  ctx.font = `700 92px ${DISPLAY}`;
  ctx.fillText("en juegos", PAD, PAD + 240);

  const avatar = await loadImage(profile.avatar);
  const avatarY = PAD + 300;
  if (avatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(PAD + 36, avatarY + 36, 36, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, PAD, avatarY, 72, 72);
    ctx.restore();
  }
  ctx.fillStyle = TEXT;
  ctx.font = `600 38px ${BODY}`;
  ctx.fillText(fit(ctx, profile.name, WIDTH - PAD * 2 - 100), PAD + (avatar ? 96 : 0), avatarY + 50);

  // Números
  const stats = [
    [String(profile.summary?.finished_this_year ?? 0), `terminados en ${year}`],
    [String(profile.summary?.counts?.playing ?? 0), "jugando ahora"],
    [String(profile.backlog?.unplayed ?? 0), "sin estrenar"],
  ];
  const statsY = avatarY + 130;
  const gap = 24;
  const boxWidth = (WIDTH - PAD * 2 - gap * 2) / 3;
  stats.forEach(([value, label], index) => {
    const x = PAD + index * (boxWidth + gap);
    roundRect(ctx, x, statsY, boxWidth, 170, 24, SURFACE);
    ctx.fillStyle = index === 0 ? ACCENT : TEXT;
    ctx.font = `700 76px ${DISPLAY}`;
    ctx.fillText(value, x + 28, statsY + 96);
    ctx.fillStyle = MUTED;
    ctx.font = `500 26px ${BODY}`;
    ctx.fillText(fit(ctx, label, boxWidth - 56), x + 28, statsY + 140);
  });

  // Portadas: lo último que terminó (o, si no hay, lo que está jugando)
  const games = (profile.finished?.length ? profile.finished : profile.playing ?? []).slice(0, 4);
  const coversY = statsY + 230;
  ctx.fillStyle = MUTED;
  ctx.font = `600 28px ${BODY}`;
  ctx.fillText(profile.finished?.length ? "Lo último que terminé" : "Lo que estoy jugando", PAD, coversY);
  const coverWidth = (WIDTH - PAD * 2 - gap) / 2;
  const coverHeight = Math.round((coverWidth * 215) / 460);
  const covers = await Promise.all(games.map((game) => loadImage(game.header_image)));
  games.forEach((game, index) => {
    const x = PAD + (index % 2) * (coverWidth + gap);
    const y = coversY + 28 + Math.floor(index / 2) * (coverHeight + gap);
    ctx.save();
    roundRectPath(ctx, x, y, coverWidth, coverHeight, 16);
    ctx.clip();
    if (covers[index]) ctx.drawImage(covers[index], x, y, coverWidth, coverHeight);
    else {
      ctx.fillStyle = SURFACE;
      ctx.fillRect(x, y, coverWidth, coverHeight);
      ctx.fillStyle = TEXT;
      ctx.font = `600 26px ${BODY}`;
      ctx.fillText(fit(ctx, game.name, coverWidth - 40), x + 20, y + coverHeight / 2 + 10);
    }
    ctx.restore();
  });
  if (games.length === 0) {
    ctx.fillStyle = MUTED;
    ctx.font = `500 30px ${BODY}`;
    ctx.fillText("Todavía no marqué juegos como terminados.", PAD, coversY + 70);
  }

  // Pie
  const challenges = profile.challenges?.items ?? [];
  const done = challenges.filter((item) => item.progress >= item.goal).length;
  ctx.fillStyle = MUTED;
  ctx.font = `500 26px ${BODY}`;
  if (challenges.length) ctx.fillText(`Desafíos del mes: ${done} de ${challenges.length}`, PAD, HEIGHT - PAD);
  ctx.fillStyle = ACCENT;
  ctx.font = `700 26px ${DISPLAY}`;
  const tagline = "¿Qué jugamos hoy?";
  ctx.fillText(tagline, WIDTH - PAD - ctx.measureText(tagline).width, HEIGHT - PAD);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen."))), "image/png");
  });
}

/** En el celular abre el menú de compartir; en la compu (o si no se puede) la descarga. */
export async function shareYearCard(profile) {
  const blob = await renderYearCard(profile);
  const year = profile.summary?.year ?? new Date().getFullYear();
  const file = new File([blob], `ruletazo-${year}.png`, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `Mi ${year} en juegos` });
      return;
    } catch (err) {
      if (err?.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadImage(url) {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function fit(ctx, text, maxWidth) {
  let value = String(text ?? "");
  if (ctx.measureText(value).width <= maxWidth) return value;
  while (value.length > 1 && ctx.measureText(`${value}…`).width > maxWidth) value = value.slice(0, -1);
  return `${value}…`;
}

function roundRectPath(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function roundRect(ctx, x, y, width, height, radius, color) {
  roundRectPath(ctx, x, y, width, height, radius);
  ctx.fillStyle = color;
  ctx.fill();
}
