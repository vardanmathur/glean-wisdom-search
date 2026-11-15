import { describe, expect, it } from "vitest";
import { isLeftSwipe, isRightSwipe, isSwipeStartZone, isTypingTarget } from "./swipe";

describe("isLeftSwipe", () => {
  it("accepts a clear swipe to the left", () => {
    expect(isLeftSwipe({ dx: -120, dy: 10 })).toBe(true);
    expect(isLeftSwipe({ dx: -80, dy: -30 })).toBe(true);
    expect(isLeftSwipe({ dx: -60, dy: 0 })).toBe(true);
  });

  it("rejects a swipe to the right", () => {
    expect(isLeftSwipe({ dx: 120, dy: 0 })).toBe(false);
    expect(isLeftSwipe({ dx: 300, dy: 5 })).toBe(false);
  });

  it("rejects mostly vertical movement, so scrolling a long quote never shuffles", () => {
    expect(isLeftSwipe({ dx: -70, dy: 200 })).toBe(false);
    expect(isLeftSwipe({ dx: -100, dy: 80 })).toBe(false);
    expect(isLeftSwipe({ dx: -90, dy: 60 })).toBe(false); // exactly 1.5x is not enough
  });

  it("rejects a movement that is too short", () => {
    expect(isLeftSwipe({ dx: -59, dy: 0 })).toBe(false);
    expect(isLeftSwipe({ dx: -10, dy: 2 })).toBe(false);
    expect(isLeftSwipe({ dx: 0, dy: 0 })).toBe(false);
  });

  it("accepts a swipe just over the ratio", () => {
    expect(isLeftSwipe({ dx: -91, dy: 60 })).toBe(true);
  });
});

describe("isTypingTarget", () => {
  it("is true for text inputs, textareas, selects and editable content", () => {
    expect(isTypingTarget(document.createElement("input"))).toBe(true);
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
    expect(isTypingTarget(document.createElement("select"))).toBe(true);
    const editable = document.createElement("div");
    Object.defineProperty(editable, "isContentEditable", { value: true });
    expect(isTypingTarget(editable)).toBe(true);
  });

  it("is false for buttons, plain elements and nothing", () => {
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
    expect(isTypingTarget(document.createElement("div"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("isRightSwipe", () => {
  it("accepts a clear swipe to the right", () => {
    expect(isRightSwipe({ dx: 120, dy: 10 })).toBe(true);
    expect(isRightSwipe({ dx: 80, dy: -30 })).toBe(true);
    expect(isRightSwipe({ dx: 60, dy: 0 })).toBe(true);
  });

  it("rejects a swipe to the left", () => {
    expect(isRightSwipe({ dx: -120, dy: 0 })).toBe(false);
  });

  it("rejects mostly vertical movement and movements that are too short", () => {
    expect(isRightSwipe({ dx: 70, dy: 200 })).toBe(false);
    expect(isRightSwipe({ dx: 90, dy: 60 })).toBe(false); // exactly 1.5x is not enough
    expect(isRightSwipe({ dx: 59, dy: 0 })).toBe(false);
    expect(isRightSwipe({ dx: 0, dy: 0 })).toBe(false);
  });

  it("takes a longer distance and a stricter ratio, as the menu swipe does", () => {
    expect(isRightSwipe({ dx: 69, dy: 0 }, 70, 2)).toBe(false);
    expect(isRightSwipe({ dx: 70, dy: 0 }, 70, 2)).toBe(true);
    expect(isRightSwipe({ dx: 140, dy: 80 }, 70, 2)).toBe(false); // 1.75x
    expect(isRightSwipe({ dx: 150, dy: 60 }, 70, 2)).toBe(true); // 2.5x
    expect(isRightSwipe({ dx: 140, dy: 70 }, 70, 2)).toBe(false); // exactly 2x is not enough
  });
});

describe("isSwipeStartZone", () => {
  it("excludes the first and last 32px of the screen", () => {
    expect(isSwipeStartZone(0, 375)).toBe(false);
    expect(isSwipeStartZone(31, 375)).toBe(false);
    expect(isSwipeStartZone(32, 375)).toBe(true);
    expect(isSwipeStartZone(200, 375)).toBe(true);
    expect(isSwipeStartZone(343, 375)).toBe(true);
    expect(isSwipeStartZone(344, 375)).toBe(false);
    expect(isSwipeStartZone(375, 375)).toBe(false);
  });

  it("honours another edge width", () => {
    expect(isSwipeStartZone(40, 375, 48)).toBe(false);
    expect(isSwipeStartZone(48, 375, 48)).toBe(true);
  });
});
