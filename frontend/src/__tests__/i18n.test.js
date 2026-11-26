import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import en from "../i18n/en.js";
import { initialLanguage, setLang, t, translateServerMessage } from "../i18n/index.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
// t("…") y tk("…") con el texto literal como primer argumento.
const KEY_PATTERN = /\bt[k]?\(\s*"((?:[^"\\]|\\.)*)"/g;

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" || name === "i18n" ? [] : sourceFiles(path);
    return /\.jsx?$/.test(name) ? [path] : [];
  });
}

function usedKeys() {
  const keys = new Set();
  for (const file of sourceFiles(SRC)) {
    for (const match of readFileSync(file, "utf8").matchAll(KEY_PATTERN)) keys.add(JSON.parse(`"${match[1]}"`));
  }
  return keys;
}

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe("idioma con el que arranca", () => {
  it("español aunque el navegador esté en inglés (así lo leen los buscadores), con el inglés ofrecido", () => {
    expect(initialLanguage({ browser: "en-US" })).toEqual({ lang: "es", fromAddress: false, suggestEnglish: true });
    expect(initialLanguage({ browser: "es-AR" })).toEqual({ lang: "es", fromAddress: false, suggestEnglish: false });
  });

  it("respeta lo que elegiste antes", () => {
    expect(initialLanguage({ saved: "en", browser: "es-AR" }).lang).toBe("en");
    expect(initialLanguage({ saved: "es", browser: "en-US" })).toEqual({ lang: "es", fromAddress: false, suggestEnglish: false });
  });

  it("la dirección manda: los links en inglés llevan ?lang=en", () => {
    expect(initialLanguage({ search: "?lang=en", saved: "es" })).toEqual({ lang: "en", fromAddress: true, suggestEnglish: false });
    expect(initialLanguage({ search: "?perfil=gaben&lang=en" }).lang).toBe("en");
    expect(initialLanguage({ search: "?lang=fr", browser: "en-US" }).suggestEnglish).toBe(true);
  });
});

describe("traducción al inglés", () => {
  afterEach(() => setLang("es"));

  it("tiene todos los textos que usa la página", () => {
    const keys = usedKeys();
    expect(keys.size).toBeGreaterThan(300);
    const missing = [...keys].filter((key) => !(key in en));
    expect(missing).toEqual([]);
  });

  it("conserva las mismas variables en cada traducción", () => {
    const broken = Object.entries(en).filter(([es, english]) => placeholders(es).join() !== placeholders(english).join());
    expect(broken).toEqual([]);
  });

  it("cambia de idioma y reemplaza las variables", () => {
    setLang("es");
    expect(t("Te tocó {name}", { name: "Hades" })).toBe("Te tocó Hades");
    setLang("en");
    expect(t("Te tocó {name}", { name: "Hades" })).toBe("You got Hades");
    // Sin traducción: se muestra el español en vez de una clave vacía.
    expect(t("Texto sin traducir")).toBe("Texto sin traducir");
  });

  it("traduce los mensajes del backend, también los que tienen partes variables", () => {
    setLang("en");
    expect(translateServerMessage("Esta sala no existe o ya cerró.")).toBe("This room doesn't exist or has already closed.");
    expect(translateServerMessage("No se encontró ningún perfil de Steam para 'gaben'.")).toBe("No Steam profile found for 'gaben'.");
    setLang("es");
    expect(translateServerMessage("Esta sala no existe o ya cerró.")).toBe("Esta sala no existe o ya cerró.");
  });
});
