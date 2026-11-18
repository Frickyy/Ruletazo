import { describe, expect, it } from "vitest";
import { isNearComplete, matchesFilters, pickWeighted, smartWeight } from "../services/libraryFilters.js";
import { tokenize } from "../components/FormattedText.jsx";

const game = (overrides) => ({ appid: 1, name: "Juego", genres: [], playtime_forever_minutes: 0, ...overrides });

describe("modos de juego y familia", () => {
  it("filtra por cooperativo, multijugador y pantalla compartida", () => {
    const portal = game({ single_player: true, coop: true, multiplayer: true, local_multiplayer: true });
    const hades = game({ single_player: true });
    expect(matchesFilters(portal, { mode: "coop" })).toBe(true);
    expect(matchesFilters(hades, { mode: "coop" })).toBe(false);
    expect(matchesFilters(hades, { mode: "single" })).toBe(true);
    expect(matchesFilters(portal, { mode: "local" })).toBe(true);
  });

  it("'en común' deja solo los que tenés vos y alguien de tu familia", () => {
    expect(matchesFilters(game({ source: "both" }), { inCommon: true })).toBe(true);
    expect(matchesFilters(game({ source: "you" }), { inCommon: true })).toBe(false);
    expect(matchesFilters(game({ source: "friend" }), { inCommon: true })).toBe(false);
  });
});

describe("estados", () => {
  it("la ruleta puede sacar los terminados", () => {
    const finished = game({ state: "finished" });
    expect(matchesFilters(finished, { includeFinished: false })).toBe(false);
    expect(matchesFilters(finished, { includeFinished: true })).toBe(true);
  });

  it("colección 'Jugando' y filtro por estado", () => {
    expect(matchesFilters(game({ state: "playing" }), { collection: "playing" })).toBe(true);
    expect(matchesFilters(game(), { collection: "playing" })).toBe(false);
    expect(matchesFilters(game(), { state: "none" })).toBe(true);
    expect(matchesFilters(game({ state: "abandoned" }), { state: "none" })).toBe(false);
    expect(matchesFilters(game({ state: "abandoned" }), { state: "abandoned" })).toBe(true);
  });
});

describe("casi al 100%", () => {
  it("80% o más, pero sin estar completo", () => {
    expect(isNearComplete(game({ achievements_unlocked: 45, achievements_total: 50 }))).toBe(true);
    expect(isNearComplete(game({ achievements_unlocked: 50, achievements_total: 50 }))).toBe(false);
    expect(isNearComplete(game({ achievements_unlocked: 10, achievements_total: 50 }))).toBe(false);
    expect(isNearComplete(game({}))).toBe(false);
    expect(matchesFilters(game({ achievements_unlocked: 9, achievements_total: 10 }), { collection: "near_complete" })).toBe(true);
  });
});

describe("ruleta inteligente", () => {
  it("pesa más a los sin estrenar, cortos y bien reseñados", () => {
    const backlog = game({ playtime_forever_minutes: 0, duration_hours: 8, review_score_desc: "Muy positivas" });
    const played = game({ playtime_forever_minutes: 900, duration_hours: 80, review_score_desc: "Mixtas" });
    expect(smartWeight(backlog)).toBeGreaterThan(smartWeight(played));
    expect(smartWeight(game({ review_score_desc: "Mayormente positivas", playtime_forever_minutes: 60 }))).toBe(1);
  });

  it("pickWeighted respeta los pesos", () => {
    const items = ["a", "b"];
    const weights = { a: 1, b: 3 };
    expect(pickWeighted(items, (item) => weights[item], () => 0.2)).toBe("a"); // 0.2 * 4 = 0.8 < 1
    expect(pickWeighted(items, (item) => weights[item], () => 0.5)).toBe("b");
    expect(pickWeighted([], () => 1)).toBeNull();
  });
});

describe("formato del foro", () => {
  it("negrita, spoiler y links (sin el punto final)", () => {
    expect(tokenize("Muy **bueno** pero ||muere al final|| mirá https://example.com/a.")).toEqual([
      { type: "text", text: "Muy " },
      { type: "bold", text: "bueno" },
      { type: "text", text: " pero " },
      { type: "spoiler", text: "muere al final" },
      { type: "text", text: " mirá " },
      { type: "link", text: "https://example.com/a" },
      { type: "text", text: "." },
    ]);
  });

  it("no toma como link algo que no empieza con http", () => {
    expect(tokenize("javascript:alert(1)")).toEqual([{ type: "text", text: "javascript:alert(1)" }]);
  });
});
