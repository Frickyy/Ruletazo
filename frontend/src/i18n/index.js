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
 * La página arranca en español salvo que la dirección pida otro idioma (?lang=en) o que ya hayas
 * elegido uno: no se adivina por el navegador (ver initialLanguage).
 *
 * El idioma vive en este módulo (no en un contexto de React): App se suscribe con useLang() y,
 * al cambiarlo, se vuelve a dibujar toda la página. Los mensajes del backend se traducen en
 * services/api.js con translateServerMessage().
 */
import { useSyncExternalStore } from "react";
import en from "./en.js";

const STORAGE_KEY = "ruletazo.lang";
export const LANGUAGES = ["es", "en"];

/**
 * Con qué idioma arranca la página y si conviene ofrecer el inglés. Primero el que pide la
 * dirección (?lang=en: los links en inglés lo llevan), después el que elegiste antes y si no,
 * español. No se adivina por el idioma del navegador: los buscadores entran con el navegador en
 * inglés y guardaban la página en inglés. A quien tiene el navegador en otro idioma se le ofrece
 * pasar al inglés con un aviso (ver useEnglishSuggestion).
 */
export function initialLanguage({ search = "", saved = null, browser = "es" } = {}) {
  const fromAddress = new URLSearchParams(search).get("lang");
  if (LANGUAGES.includes(fromAddress)) return { lang: fromAddress, fromAddress: true, suggestEnglish: false };
  if (LANGUAGES.includes(saved)) return { lang: saved, fromAddress: false, suggestEnglish: false };
  return { lang: "es", fromAddress: false, suggestEnglish: !browser.toLowerCase().startsWith("es") };
}

const start = initialLanguage({
  search: typeof location === "undefined" ? "" : location.search,
  saved: savedLanguage(),
  browser: typeof navigator === "undefined" ? "es" : navigator.language || "es",
});
let current = start.lang;
let englishSuggested = start.suggestEnglish;
const listeners = new Set();
// Un link con ?lang= cuenta como elegir el idioma: se recuerda para las próximas visitas.
if (start.fromAddress) remember(current);
applyToDocument(current);

function savedLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return LANGUAGES.includes(saved) ? saved : null;
  } catch {
    return null; /* almacenamiento bloqueado */
  }
}

function remember(lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* almacenamiento bloqueado: dura mientras la página esté abierta */
  }
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

/** Elegir un idioma (también el que ya estaba) lo recuerda y deja de ofrecer el inglés. */
export function setLang(lang) {
  if (!LANGUAGES.includes(lang)) return;
  const changed = lang !== current || englishSuggested;
  current = lang;
  englishSuggested = false;
  remember(lang);
  applyToDocument(lang);
  if (changed) listeners.forEach((listener) => listener());
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

/** Si mostrar el aviso para pasar al inglés: navegador en otro idioma y todavía sin elegir. */
export function useEnglishSuggestion() {
  return useSyncExternalStore(subscribe, () => englishSuggested, () => false);
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
