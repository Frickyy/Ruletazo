import { describe, expect, it } from "vitest";
import { durationFilterAvailable, genresOf, isStale, matchesFilters, sortGames } from "../services/libraryFilters.js";

const NOW = Date.UTC(2026, 10, 18);
const DAY = 24 * 60 * 60;
const game = (overrides) => ({
  appid: 1,
  name: "Juego",
  genres: [],
  playtime_forever_minutes: 0,
  last_played: null,
  duration_hours: null,
  is_favorite: false,
  is_hidden: false,
  is_adult: false,
  is_software: false,
  ...overrides,
});

describe("matchesFilters", () => {
  it("los ocultos solo aparecen en la colección Ocultos", () => {
    const hidden = game({ is_hidden: true });
    expect(matchesFilters(hidden, {})).toBe(false);
    expect(matchesFilters(hidden, { collection: "hidden" })).toBe(true);
    expect(matchesFilters(game(), { collection: "hidden" })).toBe(false);
  });

  it("oculta +18 solo si se pide", () => {
    const adult = game({ is_adult: true });
    expect(matchesFilters(adult, { hideAdult: true })).toBe(false);
    expect(matchesFilters(adult, { hideAdult: false })).toBe(true);
  });

  it("oculta programas solo si se pide", () => {
    const soundpad = game({ is_software: true });
    expect(matchesFilters(soundpad, { hideSoftware: true })).toBe(false);
    expect(matchesFilters(soundpad, { hideSoftware: false })).toBe(true);
    expect(matchesFilters(game(), { hideSoftware: true })).toBe(true);
  });

  it("filtra por duración y deja afuera los que no tienen dato", () => {
    expect(matchesFilters(game({ duration_hours: 6 }), { duration: "short" })).toBe(true);
    expect(matchesFilters(game({ duration_hours: 10 }), { duration: "short" })).toBe(false);
    expect(matchesFilters(game({ duration_hours: 10 }), { duration: "medium" })).toBe(true);
    expect(matchesFilters(game({ duration_hours: 45 }), { duration: "long" })).toBe(true);
    expect(matchesFilters(game({ duration_hours: null }), { duration: "short" })).toBe(false);
    expect(matchesFilters(game({ duration_hours: null }), { duration: "any" })).toBe(true);
  });

  it("abandonados: con horas y sin jugar hace más de 6 meses", () => {
    const old = game({ playtime_forever_minutes: 300, last_played: NOW / 1000 - 200 * DAY });
    const recent = game({ playtime_forever_minutes: 300, last_played: NOW / 1000 - 10 * DAY });
    const never = game({ playtime_forever_minutes: 0, last_played: null });
    expect(isStale(old, NOW)).toBe(true);
    expect(isStale(recent, NOW)).toBe(false);
    expect(matchesFilters(never, { playtimeFilter: "stale" }, NOW)).toBe(false);
  });

  it("busca sin distinguir mayúsculas", () => {
    expect(matchesFilters(game({ name: "Hollow Knight" }), { search: "hollow" })).toBe(true);
    expect(matchesFilters(game({ name: "Hollow Knight" }), { search: "celeste" })).toBe(false);
  });
});

describe("sortGames", () => {
  it("deja al final los juegos sin el dato, en ambos sentidos", () => {
    const games = [game({ appid: 1, name: "B", price_cents: 500 }), game({ appid: 2, name: "A" }), game({ appid: 3, name: "C", price_cents: 100 })];
    expect(sortGames(games, "price", "asc").map((item) => item.appid)).toEqual([3, 1, 2]);
    expect(sortGames(games, "price", "desc").map((item) => item.appid)).toEqual([1, 3, 2]);
  });

  it("ordena por nombre en español", () => {
    const games = [game({ appid: 1, name: "Ñandú" }), game({ appid: 2, name: "Zelda" }), game({ appid: 3, name: "nave" })];
    expect(sortGames(games, "name").map((item) => item.appid)).toEqual([3, 1, 2]);
  });
});

it("genresOf junta géneros sin repetir", () => {
  expect(genresOf([game({ genres: ["Rol", "Acción"] }), game({ genres: ["Acción"] })])).toEqual(["Acción", "Rol"]);
});

describe("durationFilterAvailable", () => {
  it("se muestra cuando al menos la mitad de los juegos tiene duración", () => {
    const known = game({ duration_hours: 10.4 });
    const unknown = game({ duration_hours: null });
    expect(durationFilterAvailable([])).toBe(false);
    expect(durationFilterAvailable([unknown])).toBe(false);
    // Uno de cada tres (lo que hay hoy con IGDB): filtrar dejaría afuera a casi todos.
    expect(durationFilterAvailable([known, unknown, unknown])).toBe(false);
    expect(durationFilterAvailable([known, unknown])).toBe(true);
  });
});
