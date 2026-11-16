import { describe, expect, it } from "vitest";
import { pickRandomN } from "./randomPick";

describe("pickRandomN", () => {
  const items = Array.from({ length: 10 }, (_, i) => i);

  it("returns n distinct items from the list", () => {
    const picked = pickRandomN(items, 4);
    expect(picked).toHaveLength(4);
    expect(new Set(picked).size).toBe(4);
    picked.forEach((p) => expect(items).toContain(p));
  });

  it("returns everything (shuffled) when asked for more than exist, and nothing for 0 or an empty list", () => {
    expect(pickRandomN(items, 99).sort((a, b) => a - b)).toEqual(items);
    expect(pickRandomN(items, 0)).toEqual([]);
    expect(pickRandomN([], 3)).toEqual([]);
    expect(pickRandomN(items, -2)).toEqual([]);
  });

  it("does not modify the input", () => {
    const copy = items.slice();
    pickRandomN(items, 5);
    expect(items).toEqual(copy);
  });

  it("can reach the last item even when the random source returns just under 1", () => {
    expect(pickRandomN(items, 1, () => 0.999999)).toEqual([9]);
    expect(pickRandomN(items, 1, () => 0)).toEqual([0]);
  });

  it("is uniform: every item gets picked about equally often, including from the far end of the list", () => {
    const counts = new Array(items.length).fill(0);
    const runs = 20000;
    for (let r = 0; r < runs; r++) counts[pickRandomN(items, 1)[0]]++;
    const expected = runs / items.length;
    counts.forEach((n) => expect(Math.abs(n - expected)).toBeLessThan(expected * 0.15));
  });
});