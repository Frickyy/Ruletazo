import { afterEach, describe, expect, it } from "vitest";
import { setLang } from "../i18n/index.js";
import { buildBacklogShareText } from "../services/backlogCard.js";
import { backlogStats, formatMoney } from "../services/backlogStats.js";

const game = (appid, overrides = {}) => ({
  appid,
  name: `Juego ${appid}`,
  playtime_forever_minutes: 0,
  price_cents: 1000,
  source: "you",
  ...overrides,
});

describe("la pila sin jugar", () => {
  afterEach(() => setLang("es"));

  it("cuenta solo los juegos propios sin estrenar y suma su precio de hoy", () => {
    const stats = backlogStats([
      game(1, { price_cents: 1999 }),
      game(2, { price_cents: 4999 }),
      game(3, { playtime_forever_minutes: 30 }), // jugado
      game(4, { source: "friend" }), // de la familia
      game(5, { is_software: true }), // un programa
      game(6, { is_hidden: true }), // lo ocultó
      game(7, { price_cents: 0 }), // gratis: cuenta, pero no suma
      game(8, { source: "both", price_cents: 500 }), // lo tienen los dos: es tuyo
    ]);

    expect(stats.total).toBe(6); // sin el de la familia ni el programa
    expect(stats.unplayed).toBe(4);
    expect(stats.priced).toBe(4);
    expect(stats.valueCents).toBe(1999 + 4999 + 0 + 500);
    expect(stats.top.map((item) => item.appid)).toEqual([2, 1, 8, 7]);
  });

  it("los juegos sin precio cargado no suman y se informan aparte", () => {
    const stats = backlogStats([game(1, { price_cents: null }), game(2, { price_cents: undefined }), game(3)]);

    expect(stats.unplayed).toBe(3);
    expect(stats.priced).toBe(1);
    expect(stats.valueCents).toBe(1000);
  });

  it("el texto para compartir dice cuántos y cuánto valen, y lleva a la página", () => {
    setLang("es");
    const withValue = buildBacklogShareText({ unplayed: 75, valueCents: 123456 }, "https://ruletazo.app");
    expect(withValue.text).toContain("75 juegos de Steam sin estrenar");
    expect(withValue.text).toMatch(/1\.235/);
    expect(withValue.url).toBe("https://ruletazo.app");

    // Sin precios cargados todavía: no inventa un valor.
    const withoutValue = buildBacklogShareText({ unplayed: 75, valueCents: 0 }, "https://ruletazo.app");
    expect(withoutValue.text).not.toMatch(/US\$|valen/);
  });

  it("muestra el valor en dólares sin centavos", () => {
    setLang("es");
    expect(formatMoney(123456)).toMatch(/1\.235/);
    setLang("en");
    expect(formatMoney(123456)).toBe("$1,235");
  });
});
