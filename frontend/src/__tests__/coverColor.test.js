import { describe, expect, it } from "vitest";
import { accentFromPixels, hslToHex, rgbToHsl } from "../services/coverColor.js";

describe("conversión de colores", () => {
  it("rgb → hsl → hex vuelve al mismo color", () => {
    for (const [r, g, b] of [[255, 92, 154], [253, 248, 83], [108, 180, 229]]) {
      const [h, s, l] = rgbToHsl(r, g, b);
      const hex = hslToHex(h, s, l);
      expect(hex).toBe(`#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`);
    }
  });

  it("los grises no tienen saturación", () => {
    expect(rgbToHsl(128, 128, 128)[1]).toBe(0);
  });
});

describe("accentFromPixels", () => {
  const pixels = (groups) =>
    new Uint8ClampedArray(groups.flatMap(([count, [r, g, b]]) => Array.from({ length: count }, () => [r, g, b, 255]).flat()));

  it("una portada casi negra con un detalle rojo toma el rojo", () => {
    const accent = accentFromPixels(pixels([[970, [10, 10, 12]], [30, [220, 30, 30]]]));
    expect(accent).not.toBeNull();
    const [h] = rgbToHsl(...hexToRgb(accent.accent));
    expect(h < 0.05 || h > 0.95).toBe(true);
  });

  it("una portada en tonos apagados igual da un color", () => {
    expect(accentFromPixels(pixels([[1000, [120, 140, 150]]]))).not.toBeNull();
  });

  it("una portada en blanco y negro no da color", () => {
    expect(accentFromPixels(pixels([[500, [20, 20, 20]], [500, [200, 200, 200]]]))).toBeNull();
  });
});

function hexToRgb(hex) {
  return [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
}
