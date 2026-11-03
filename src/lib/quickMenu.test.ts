import { describe, expect, it } from "vitest";
import {
  QUICK_MENU_ITEMS,
  arcOffsets,
  clampCenterY,
  fractionToY,
  parseStoredFraction,
  yToFraction,
} from "./quickMenu";

describe("QUICK_MENU_ITEMS", () => {
  it("has the seven shortcuts in arc order, each with a route or an action", () => {
    expect(QUICK_MENU_ITEMS.map((i) => i.label)).toEqual([
      "Admin Hub",
      "Inbox",
      "Admin Studio",
      "Add highlight",
      "Search",
      "Books",
      "Overlap review",
    ]);
    for (const item of QUICK_MENU_ITEMS) expect(Boolean(item.to) !== Boolean(item.action)).toBe(true);
    expect(new Set(QUICK_MENU_ITEMS.map((i) => i.id)).size).toBe(QUICK_MENU_ITEMS.length);
    expect(new Set(QUICK_MENU_ITEMS.map((i) => i.icon)).size).toBe(QUICK_MENU_ITEMS.length);
  });
});

describe("arcOffsets", () => {
  const R = 110;
  const offsets = arcOffsets(7, R);

  it("starts straight up, ends straight down, middle straight right", () => {
    expect(offsets[0]).toEqual({ x: 0, y: -R });
    expect(offsets[3]).toEqual({ x: R, y: 0 });
    expect(offsets[6]).toEqual({ x: 0, y: R });
  });

  it("keeps every item on the right half and on the circle", () => {
    for (const o of offsets) {
      expect(o.x).toBeGreaterThanOrEqual(0);
      expect(Math.hypot(o.x, o.y)).toBeCloseTo(R, 1);
    }
  });

  it("spaces items evenly, 30 degrees apart for seven", () => {
    const angles = offsets.map((o) => (Math.atan2(o.y, o.x) * 180) / Math.PI);
    for (let i = 1; i < angles.length; i++) expect(angles[i] - angles[i - 1]).toBeCloseTo(30, 0);
  });

  it("handles small counts", () => {
    expect(arcOffsets(0)).toEqual([]);
    expect(arcOffsets(1, 100)).toEqual([{ x: 100, y: 0 }]);
    expect(arcOffsets(2, 100)).toEqual([
      { x: 0, y: -100 },
      { x: 0, y: 100 },
    ]);
  });
});

describe("clampCenterY", () => {
  // viewport 800 tall, top bar 64, bottom inset 0, radius 110, item 48 -> 198..666
  it("leaves a safe position alone", () => {
    expect(clampCenterY(400, 800, 64, 0)).toBe(400);
  });

  it("pushes the button down so the fan clears the top bar", () => {
    expect(clampCenterY(50, 800, 64, 0)).toBe(198);
  });

  it("pushes the button up so the fan clears the bottom, including a safe-area inset", () => {
    expect(clampCenterY(790, 800, 64, 0)).toBe(666);
    expect(clampCenterY(790, 800, 64, 34)).toBe(632);
  });

  it("uses the middle of the band when the screen is too short", () => {
    expect(clampCenterY(10, 300, 64, 0)).toBe(182);
  });
});

describe("position fractions", () => {
  it("converts between pixels and a fraction of the viewport", () => {
    expect(fractionToY(0.5, 800)).toBe(400);
    expect(yToFraction(200, 800)).toBe(0.25);
  });

  it("parses the stored value and falls back to the default", () => {
    expect(parseStoredFraction("0.4")).toBe(0.4);
    expect(parseStoredFraction(null)).toBe(0.8);
    expect(parseStoredFraction("abc")).toBe(0.8);
    expect(parseStoredFraction("1.5")).toBe(0.8);
  });
});
