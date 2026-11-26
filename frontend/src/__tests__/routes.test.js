import { describe, expect, it } from "vitest";
import { buildPath, parseRoute, pathOfRoute, routeFromLocation } from "../routes.js";

describe("rutas", () => {
  it("lee cada sección y vuelve a la ruleta si no la conoce", () => {
    expect(parseRoute("/biblioteca")).toEqual({ view: "library", forumTarget: null });
    expect(parseRoute("/")).toEqual({ view: "roulette", forumTarget: null });
    expect(parseRoute("/cualquiera")).toEqual({ view: "roulette", forumTarget: null });
    expect(parseRoute("/foro/").view).toBe("forum");
  });

  it("lee el foro de un juego, sus pestañas y un hilo", () => {
    expect(parseRoute("/foro/juego/620")).toEqual({ view: "forum", forumTarget: { appid: 620, tab: "reviews" } });
    expect(parseRoute("/foro/juego/620/discusiones").forumTarget.tab).toBe("threads");
    expect(parseRoute("/foro/juego/620/hilo/7").forumTarget).toEqual({ appid: 620, threadId: 7 });
    expect(parseRoute("/foro/juego/abc").forumTarget).toBeNull();
  });

  it("arma la dirección de vuelta igual a como la lee", () => {
    for (const path of ["/", "/biblioteca", "/foro", "/foro/juego/620", "/foro/juego/620/discusiones", "/foro/juego/620/hilo/7", "/perfil", "/sala/ABC234", "/obs"]) {
      expect(pathOfRoute(parseRoute(path))).toBe(path);
    }
  });

  it("la ruleta es la portada", () => {
    expect(buildPath("roulette")).toBe("/");
    expect(buildPath("algo-que-no-existe")).toBe("/");
    expect(pathOfRoute(parseRoute("/ruleta"))).toBe("/");
  });

  it("lee y arma salas en grupo", () => {
    expect(parseRoute("/sala/abc234")).toEqual({ view: "room", forumTarget: null, roomCode: "ABC234" });
    expect(parseRoute("/sala/<x>").roomCode).toBeNull();
    expect(buildPath("room", null, "ABC234")).toBe("/sala/ABC234");
    // Un código en minúsculas se pasa a la dirección de siempre.
    expect(pathOfRoute(parseRoute("/sala/abc234"))).toBe("/sala/ABC234");
  });

  it("lee y arma perfiles y páginas legales", () => {
    expect(parseRoute("/perfil")).toEqual({ view: "profile", forumTarget: null, profileId: null });
    expect(parseRoute("/perfil/76561198000000001").profileId).toBe("76561198000000001");
    expect(parseRoute("/perfil/john.doe").profileId).toBe("john.doe");
    expect(parseRoute("/perfil/<script>").profileId).toBeNull();
    expect(buildPath("profile", null, "gaben")).toBe("/perfil/gaben");
    expect(buildPath("privacy")).toBe("/privacidad");
    expect(parseRoute("/terminos").view).toBe("terms");
  });

  it("los links viejos con hash llevan a la misma sección", () => {
    expect(routeFromLocation({ pathname: "/", hash: "#/sala/abc234" })).toEqual({ view: "room", forumTarget: null, roomCode: "ABC234" });
    expect(routeFromLocation({ pathname: "/", hash: "#/foro/juego/620/hilo/7" }).forumTarget).toEqual({ appid: 620, threadId: 7 });
    expect(pathOfRoute(routeFromLocation({ pathname: "/", hash: "#/perfil/gaben" }))).toBe("/perfil/gaben");
    // Un ancla de la misma página (#apoyar) no es una ruta vieja.
    expect(routeFromLocation({ pathname: "/foro", hash: "#apoyar" }).view).toBe("forum");
  });
});
