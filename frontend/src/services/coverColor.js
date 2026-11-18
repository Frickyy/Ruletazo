/**
 * Color de acento a partir de la portada de un juego.
 *
 * La portada se dibuja chiquita en un canvas (el CDN de Steam permite leerla: manda
 * Access-Control-Allow-Origin: *) y se busca el tono que más pesa entre los píxeles con color:
 * se ignoran grises, negros y blancos, que en casi todas las portadas son el fondo o el texto.
 * Ese tono se lleva a una luminosidad y saturación que se lean bien sobre el fondo oscuro
 * y con texto oscuro encima (los botones). Si la portada no tiene un color claro, devuelve null.
 */

const SAMPLE_WIDTH = 64;
const SAMPLE_HEIGHT = 30;
const HUE_BINS = 24;

const cache = new Map();

export function coverAccent(imageUrl) {
  if (!imageUrl) return Promise.resolve(null);
  if (!cache.has(imageUrl)) {
    cache.set(imageUrl, loadImage(imageUrl).then(accentFromImage).catch(() => null));
  }
  return cache.get(imageUrl);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

function accentFromImage(image) {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_WIDTH;
  canvas.height = SAMPLE_HEIGHT;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
  const { data } = context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);

  const bins = Array.from({ length: HUE_BINS }, () => ({ weight: 0, r: 0, g: 0, b: 0 }));
  let colorful = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    if (s < 0.3 || l < 0.15 || l > 0.9) continue; // grises, sombras y brillos
    colorful += 1;
    // Pesan más los píxeles saturados y de luminosidad media: son los que "se ven" de color.
    const weight = s * s * (1 - Math.abs(l - 0.5) * 1.6);
    const bin = bins[Math.floor(h * HUE_BINS) % HUE_BINS];
    bin.weight += weight;
    bin.r += data[i] * weight;
    bin.g += data[i + 1] * weight;
    bin.b += data[i + 2] * weight;
  }

  // Menos del 8% de píxeles con color: portada en blanco y negro, se deja el acento de siempre.
  if (colorful < (SAMPLE_WIDTH * SAMPLE_HEIGHT) * 0.08) return null;

  // El bin más pesado, sumado a sus vecinos (un mismo color suele caer entre dos bins).
  let best = 0;
  let bestScore = -1;
  bins.forEach((_, index) => {
    const score = [-1, 0, 1].reduce((sum, offset) => sum + bins[(index + offset + HUE_BINS) % HUE_BINS].weight, 0);
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  });
  const merged = [-1, 0, 1]
    .map((offset) => bins[(best + offset + HUE_BINS) % HUE_BINS])
    .reduce((sum, bin) => ({ weight: sum.weight + bin.weight, r: sum.r + bin.r, g: sum.g + bin.g, b: sum.b + bin.b }));
  if (merged.weight === 0) return null;

  const [h, s] = rgbToHsl(merged.r / merged.weight, merged.g / merged.weight, merged.b / merged.weight);
  const saturation = Math.max(s, 0.7);
  return {
    accent: hslToHex(h, saturation, 0.66),
    hover: hslToHex(h, saturation, 0.74),
  };
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToHex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const channel = (n) => {
    const k = (n + h * 12) % 12;
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}
