import { afterEach, describe, expect, it, vi } from "vitest";
import { buildShareText, shareResult } from "../services/shareResult.js";

describe("buildShareText", () => {
  it("menciona el juego y lleva a la página, no al juego", () => {
    const data = buildShareText("Hades", "https://ruletazo.app");
    expect(data.text).toContain("Hades");
    expect(data.url).toBe("https://ruletazo.app");
  });
});

describe("shareResult", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("usa el menú nativo si existe", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, clipboard: { writeText: vi.fn() } });
    await expect(shareResult("Hades", "https://ruletazo.app")).resolves.toBe("shared");
    expect(share).toHaveBeenCalledOnce();
  });

  it("si se cierra el menú no copia nada", async () => {
    const writeText = vi.fn();
    const abort = Object.assign(new Error("cancelado"), { name: "AbortError" });
    vi.stubGlobal("navigator", { share: vi.fn().mockRejectedValue(abort), clipboard: { writeText } });
    await expect(shareResult("Hades", "https://ruletazo.app")).resolves.toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("sin menú nativo copia texto y link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(shareResult("Hades", "https://ruletazo.app")).resolves.toBe("copied");
    expect(writeText.mock.calls[0][0]).toMatch(/Hades.*https:\/\/ruletazo\.app$/);
  });
});
