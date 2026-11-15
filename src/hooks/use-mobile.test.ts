import { afterEach, describe, expect, it } from "vitest";
import { isMobileViewport } from "./use-mobile";

const original = window.innerWidth;
const setWidth = (w: number) => Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: w });

describe("isMobileViewport", () => {
  afterEach(() => setWidth(original));

  it("is true below the 768px breakpoint and false from it up", () => {
    setWidth(375);
    expect(isMobileViewport()).toBe(true);
    setWidth(767);
    expect(isMobileViewport()).toBe(true);
    setWidth(768);
    expect(isMobileViewport()).toBe(false);
    setWidth(1280);
    expect(isMobileViewport()).toBe(false);
  });
});
