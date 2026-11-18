import { describe, expect, it } from "vitest";
import { hslToHex, rgbToHsl } from "../services/coverColor.js";

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
