import { describe, expect, it } from "vitest";
import { avoidAdjacentRepeats, sample } from "../services/reelStrip.js";

const pool = [1, 2, 3, 4, 5].map((appid) => ({ appid }));

describe("tira del rodillo", () => {
  it("sample repite el pool si hace falta", () => {
    expect(sample(pool, 12)).toHaveLength(12);
    expect(sample([], 5)).toEqual([]);
  });

  it("no deja portadas iguales pegadas y no mueve las posiciones fijas", () => {
    const cards = [pool[0], pool[0], pool[1], pool[1], pool[2], pool[2], pool[3], pool[4]];
    const fixed = new Set([0, 5]);
    const result = avoidAdjacentRepeats(cards, fixed);
    expect(result[0]).toBe(cards[0]);
    expect(result[5]).toBe(cards[5]);
    for (let i = 1; i < result.length; i += 1) expect(result[i].appid).not.toBe(result[i - 1].appid);
  });
});
