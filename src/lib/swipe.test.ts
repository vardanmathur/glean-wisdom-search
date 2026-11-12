import { describe, expect, it } from "vitest";
import { isLeftSwipe, isTypingTarget } from "./swipe";

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
