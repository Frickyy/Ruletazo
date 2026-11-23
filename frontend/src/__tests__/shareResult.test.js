import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/resultCard.js", () => ({
  renderResultCard: vi.fn().mockResolvedValue(new Blob(["png"], { type: "image/png" })),
}));

const { buildShareText, shareResult } = await import("../services/shareResult.js");
const HADES = { appid: 1145360, name: "Hades", header_image: "https://example.com/hades.jpg" };

describe("buildShareText", () => {
  it("menciona el juego y lleva a la página, no al juego", () => {
    const data = buildShareText("Hades", "https://ruletazo.app");
    expect(data.text).toContain("Hades");
    expect(data.url).toBe("https://ruletazo.app");
  });
});

describe("shareResult", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("en el celular comparte la imagen junto con el texto", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, canShare: () => true, clipboard: { writeText: vi.fn() } });
    await expect(shareResult(HADES, "https://ruletazo.app")).resolves.toBe("shared");
    const payload = share.mock.calls[0][0];
    expect(payload.files[0].name).toBe("ruletazo-1145360.png");
    expect(payload.text).toContain("Hades");
  });

  it("si no puede compartir archivos, comparte solo el texto", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, canShare: () => false, clipboard: { writeText: vi.fn() } });
    await expect(shareResult(HADES, "https://ruletazo.app")).resolves.toBe("shared");
    expect(share.mock.calls[0][0].files).toBeUndefined();
  });

  it("si se cierra el menú no copia nada", async () => {
    const writeText = vi.fn();
    const abort = Object.assign(new Error("cancelado"), { name: "AbortError" });
    vi.stubGlobal("navigator", { share: vi.fn().mockRejectedValue(abort), clipboard: { writeText } });
    await expect(shareResult(HADES, "https://ruletazo.app")).resolves.toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("sin menú nativo copia texto y link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(shareResult(HADES, "https://ruletazo.app")).resolves.toBe("copied");
    expect(writeText.mock.calls[0][0]).toMatch(/Hades.*https:\/\/ruletazo\.app$/);
  });
});
