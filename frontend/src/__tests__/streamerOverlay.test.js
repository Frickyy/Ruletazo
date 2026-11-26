import { describe, expect, it } from "vitest";
import {
  isOverlayLocation,
  overlayPool,
  overlayUrl,
  pickWinner,
  readOverlayOptions,
  steamIdFromInput,
} from "../services/streamerOverlay.js";

const ORIGIN = "https://ruletazo.app";

describe("modo streamer", () => {
  it("saca el perfil de un link de Steam", () => {
    expect(steamIdFromInput("https://steamcommunity.com/id/gaben/")).toBe("gaben");
    expect(steamIdFromInput(" steamcommunity.com/profiles/76561197960287930 ")).toBe("76561197960287930");
    expect(steamIdFromInput("gaben")).toBe("gaben");
    expect(steamIdFromInput("")).toBe("");
  });

  it("arma la dirección solo con lo que cambia", () => {
    expect(overlayUrl(ORIGIN, { profile: "https://steamcommunity.com/id/gaben" })).toBe(`${ORIGIN}/obs?perfil=gaben`);
    expect(overlayUrl(ORIGIN, { profile: "gaben", filter: "sin-jugar", background: "verde", sound: false })).toBe(
      `${ORIGIN}/obs?perfil=gaben&filtro=sin-jugar&fondo=verde&sonido=0`,
    );
    expect(overlayUrl(ORIGIN, { demo: true })).toBe(`${ORIGIN}/obs?demo=1`);
    expect(overlayUrl(ORIGIN, {})).toBe(`${ORIGIN}/obs`);
    // Armada en inglés, la fuente lo pide en el link (la ruleta en vivo arranca en español).
    expect(overlayUrl(ORIGIN, { demo: true, lang: "en" })).toBe(`${ORIGIN}/obs?demo=1&lang=en`);
  });

  it("lee la dirección de vuelta, con valores por defecto si algo no se entiende", () => {
    expect(readOverlayOptions("?perfil=gaben&filtro=sin-jugar&fondo=verde&sonido=0")).toEqual({
      profile: "gaben",
      demo: false,
      filter: "sin-jugar",
      background: "verde",
      sound: false,
    });
    expect(readOverlayOptions("?perfil=gaben&filtro=cualquiera&fondo=rojo")).toMatchObject({ filter: "todos", background: "transparente", sound: true });
    const url = new URL(overlayUrl(ORIGIN, { profile: "gaben", filter: "menos-2h" }));
    expect(readOverlayOptions(url.search)).toMatchObject({ profile: "gaben", filter: "menos-2h" });
  });

  it("la superposición es /obs con perfil o demo; sin eso es la página que explica", () => {
    expect(isOverlayLocation({ pathname: "/obs", search: "?perfil=gaben" })).toBe(true);
    expect(isOverlayLocation({ pathname: "/obs/", search: "?demo=1" })).toBe(true);
    expect(isOverlayLocation({ pathname: "/obs", search: "" })).toBe(false);
    expect(isOverlayLocation({ pathname: "/", search: "?perfil=gaben" })).toBe(false);
  });

  it("en vivo nunca salen juegos +18, programas ni ocultos, y respeta el filtro de horas", () => {
    const games = [
      { appid: 1, name: "Sin estrenar", image: "a.jpg", playtime_forever_minutes: 0 },
      { appid: 2, name: "Jugado", header_image: "b.jpg", playtime_forever_minutes: 600 },
      { appid: 3, name: "Para adultos", playtime_forever_minutes: 0, is_adult: true },
      { appid: 4, name: "Wallpaper Engine", playtime_forever_minutes: 0, is_software: true },
      { appid: 5, name: "Oculto", playtime_forever_minutes: 0, is_hidden: true },
    ];
    expect(overlayPool(games).map((game) => game.appid)).toEqual([1, 2]);
    expect(overlayPool(games, "sin-jugar")).toEqual([{ appid: 1, name: "Sin estrenar", image: "a.jpg" }]);
    expect(overlayPool(games)[1].image).toBe("b.jpg");
  });

  it("no repite a los últimos ganadores mientras haya otros", () => {
    const pool = [{ appid: 1 }, { appid: 2 }, { appid: 3 }];
    expect(pickWinner(pool, [1, 2], () => 0).appid).toBe(3);
    expect(pickWinner(pool, [1, 2, 3], () => 0).appid).toBe(1);
  });
});
