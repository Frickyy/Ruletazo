import { describe, expect, it } from "vitest";
import { buildHash, parseRoute } from "../routes.js";

describe("rutas con hash", () => {
  it("lee cada sección y vuelve a la ruleta si no la conoce", () => {
    expect(parseRoute("#/biblioteca")).toEqual({ view: "library", forumTarget: null });
    expect(parseRoute("")).toEqual({ view: "roulette", forumTarget: null });
    expect(parseRoute("#/cualquiera")).toEqual({ view: "roulette", forumTarget: null });
  });

  it("lee el foro de un juego, sus pestañas y un hilo", () => {
    expect(parseRoute("#/foro/juego/620")).toEqual({ view: "forum", forumTarget: { appid: 620, tab: "reviews" } });
    expect(parseRoute("#/foro/juego/620/discusiones").forumTarget.tab).toBe("threads");
    expect(parseRoute("#/foro/juego/620/hilo/7").forumTarget).toEqual({ appid: 620, threadId: 7 });
    expect(parseRoute("#/foro/juego/abc").forumTarget).toBeNull();
  });

  it("arma la URL de vuelta igual a como la lee", () => {
    for (const hash of ["#/ruleta", "#/foro", "#/foro/juego/620", "#/foro/juego/620/discusiones", "#/foro/juego/620/hilo/7"]) {
      const { view, forumTarget } = parseRoute(hash);
      expect(buildHash(view, forumTarget)).toBe(hash);
    }
  });
});
