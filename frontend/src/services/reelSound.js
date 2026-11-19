/**
 * Sonidos del rodillo, generados con Web Audio (no hay archivos de audio que descargar):
 * un "tic" corto cada vez que una portada pasa por el centro y un acorde al frenar.
 * Está apagado por defecto; se activa desde la ruleta.
 */

let context = null;

function audio() {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!context) context = new AudioContextClass();
  // Los navegadores arrancan el audio suspendido hasta que hay un gesto del usuario.
  if (context.state === "suspended") context.resume().catch(() => {});
  return context;
}

function tone(frequency, { start = 0, duration = 0.05, volume = 0.08, type = "triangle" } = {}) {
  const ctx = audio();
  if (!ctx) return;
  const time = ctx.currentTime + start;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, time);
  gain.gain.setValueAtTime(volume, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(time);
  oscillator.stop(time + duration + 0.02);
}

export function playTick() {
  tone(1400, { duration: 0.035, volume: 0.05, type: "square" });
}

export function playWin() {
  [523.25, 659.25, 783.99].forEach((frequency, index) => tone(frequency, { start: index * 0.07, duration: 0.35, volume: 0.07 }));
}

/** Prepara el audio dentro del gesto del usuario (clic o tecla) para que el navegador lo permita. */
export function unlockAudio() {
  audio();
}
