/**
 * Idiomas de la página: español (el original) e inglés.
 *
 * Los textos se escriben en español directamente en el código y se pasan por `t()`: el texto en
 * español es la clave, y `en.js` tiene su traducción. Así el código se sigue leyendo igual y, si
 * falta una traducción, se muestra el español en vez de una clave rara. Un test
 * (__tests__/i18n.test.js) revisa que todos los textos marcados con t() o tk() estén en en.js.
 *
 * Variables con llaves: t("Te tocó {name}", { name }).
 *
 * El idioma vive en este módulo (no en un contexto de React): App se suscribe con useLang() y,
 * al cambiarlo, se vuelve a dibujar toda la página. Los mensajes del backend se traducen en
 * services/api.js con translateServerMessage().
 */
import { useSyncExternalStore } from "react";
import en from "./en.js";

const STORAGE_KEY = "ruletazo.lang";
export const LANGUAGES = ["es", "en"];

let current = detectLanguage();
const listeners = new Set();
applyToDocument(current);

function detectLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (LANGUAGES.includes(saved)) return saved;
  } catch {
    /* almacenamiento bloqueado */
  }
  // Primera visita: español para quien tiene el navegador en español, inglés para el resto.
  const browser = typeof navigator === "undefined" ? "es" : navigator.language || "es";
  return browser.toLowerCase().startsWith("es") ? "es" : "en";
}

function applyToDocument(lang) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang;
  const description = document.querySelector('meta[name="description"]');
  if (description) {
    description.setAttribute(
      "content",
      lang === "en"
        ? "Can't decide what to play? Spin the wheel with your Steam library and your family's."
        : "¿No sabés qué jugar? Girá la ruleta con tu biblioteca de Steam y la de tu familia.",
    );
  }
}

export function getLang() {
  return current;
}

export function setLang(lang) {
  if (!LANGUAGES.includes(lang) || lang === current) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* almacenamiento bloqueado: dura mientras la página esté abierta */
  }
  applyToDocument(lang);
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Traduce un texto en español al idioma actual. */
export function t(text, vars) {
  let result = current === "en" ? (en[text] ?? text) : text;
  if (vars) result = result.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
  return result;
}

/**
 * Marca un texto para traducir más tarde (listas de opciones definidas fuera de los componentes):
 * se guarda en español y se muestra con t(option.label).
 */
export function tk(text) {
  return text;
}

/** Formato de números y fechas según el idioma. */
export function locale() {
  return current === "en" ? "en-US" : "es-AR";
}

export function formatNumber(value) {
  return Number(value ?? 0).toLocaleString(locale());
}

/** Suscribe el componente al idioma: al cambiarlo, se vuelve a dibujar. */
export function useLang() {
  return useSyncExternalStore(subscribe, getLang, getLang);
}

// Mensajes del backend con partes variables (los fijos están en en.js como cualquier otro texto).
const SERVER_PATTERNS = [
  [/^No se encontró ningún perfil de Steam para '(.*)'\.$/, (match) => `No Steam profile found for '${match[1]}'.`],
  [/^Steam Web API respondió (\d+)\.$/, (match) => `The Steam Web API answered ${match[1]}.`],
  [/^No se pudo conectar con la Steam Web API: (.*)$/, () => "Couldn't connect to the Steam Web API."],
];

/** Traduce un mensaje de error que mandó el backend (siempre llega en español). */
export function translateServerMessage(message) {
  if (current !== "en" || typeof message !== "string") return message;
  if (en[message]) return en[message];
  for (const [pattern, build] of SERVER_PATTERNS) {
    const match = message.match(pattern);
    if (match) return build(match);
  }
  return message;
}
