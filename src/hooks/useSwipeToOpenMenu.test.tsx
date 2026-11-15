import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSwipeToOpenMenu } from "./useSwipeToOpenMenu";

const originalWidth = window.innerWidth;
const setWidth = (w: number) => Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: w });

type Point = { clientX: number; clientY: number };

// jsdom has no Touch events, so plain events carry the touch lists.
function touch(type: "touchstart" | "touchend", target: EventTarget, points: Point[], changed: Point[] = points) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, "touches", { value: type === "touchend" ? [] : points });
  Object.defineProperty(e, "changedTouches", { value: changed });
  target.dispatchEvent(e);
}

const swipe = (from: Point, to: Point, target: EventTarget = document.body) => {
  touch("touchstart", target, [from]);
  touch("touchend", target, [], [to]);
};

describe("useSwipeToOpenMenu", () => {
  let onOpen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setWidth(375);
    onOpen = vi.fn();
    document.body.innerHTML = "";
    document.body.removeAttribute("data-scroll-locked");
  });
  afterEach(() => {
    setWidth(originalWidth);
    window.getSelection()?.removeAllRanges();
  });

  const mount = (enabled = true) => renderHook(() => useSwipeToOpenMenu({ enabled, onOpen }));

  it("opens on a clear right swipe", () => {
    mount();
    swipe({ clientX: 100, clientY: 300 }, { clientX: 200, clientY: 310 });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("does nothing when disabled (other pages, or the menu is already open)", () => {
    mount(false);
    swipe({ clientX: 100, clientY: 300 }, { clientX: 220, clientY: 300 });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("ignores swipes that start in the edge zones where the phone's Back gesture lives", () => {
    mount();
    swipe({ clientX: 10, clientY: 300 }, { clientX: 150, clientY: 300 });
    swipe({ clientX: 31, clientY: 300 }, { clientX: 150, clientY: 300 });
    swipe({ clientX: 350, clientY: 300 }, { clientX: 372, clientY: 300 });
    expect(onOpen).not.toHaveBeenCalled();
    swipe({ clientX: 32, clientY: 300 }, { clientX: 150, clientY: 300 });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("needs at least 70px sideways and more than twice the vertical movement", () => {
    mount();
    swipe({ clientX: 100, clientY: 300 }, { clientX: 169, clientY: 300 }); // too short
    swipe({ clientX: 100, clientY: 300 }, { clientX: 240, clientY: 380 }); // 140 vs 80: only 1.75x
    swipe({ clientX: 100, clientY: 300 }, { clientX: 100, clientY: 500 }); // vertical
    swipe({ clientX: 200, clientY: 300 }, { clientX: 100, clientY: 300 }); // leftwards
    expect(onOpen).not.toHaveBeenCalled();
    swipe({ clientX: 100, clientY: 300 }, { clientX: 170, clientY: 300 });
    swipe({ clientX: 100, clientY: 300 }, { clientX: 250, clientY: 360 }); // 150 vs 60: 2.5x
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("needs a single finger", () => {
    mount();
    touch("touchstart", document.body, [
      { clientX: 100, clientY: 300 },
      { clientX: 200, clientY: 300 },
    ]);
    touch("touchend", document.body, [], [{ clientX: 220, clientY: 300 }]);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("is off on wider screens", () => {
    setWidth(800);
    mount();
    swipe({ clientX: 100, clientY: 300 }, { clientX: 250, clientY: 300 });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("ignores touches that start on buttons, links, inputs and the quick menu button", () => {
    mount();
    const button = document.createElement("button");
    const link = document.createElement("a");
    const input = document.createElement("input");
    const quick = document.createElement("div");
    quick.setAttribute("aria-label", "Quick menu");
    const inner = document.createElement("span");
    button.appendChild(inner);
    document.body.append(button, link, input, quick);
    for (const target of [inner, link, input, quick]) {
      swipe({ clientX: 100, clientY: 300 }, { clientX: 220, clientY: 300 }, target);
    }
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("ignores touches inside a sideways-scrolling area", () => {
    mount();
    const scroller = document.createElement("div");
    scroller.style.overflowX = "auto";
    Object.defineProperty(scroller, "scrollWidth", { value: 900 });
    Object.defineProperty(scroller, "clientWidth", { value: 300 });
    const child = document.createElement("p");
    scroller.appendChild(child);
    document.body.appendChild(scroller);
    swipe({ clientX: 100, clientY: 300 }, { clientX: 220, clientY: 300 }, child);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("is not stopped by an overflow area that does not actually scroll", () => {
    mount();
    const box = document.createElement("div");
    box.style.overflowX = "auto";
    Object.defineProperty(box, "scrollWidth", { value: 300 });
    Object.defineProperty(box, "clientWidth", { value: 300 });
    document.body.appendChild(box);
    swipe({ clientX: 100, clientY: 300 }, { clientX: 220, clientY: 300 }, box);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("ignores swipes while a dialog is showing or the page scroll is locked, but not for a hidden menu", () => {
    mount();
    const hiddenMenu = document.createElement("div");
    hiddenMenu.setAttribute("role", "menu");
    hiddenMenu.style.visibility = "hidden";
    Object.defineProperty(hiddenMenu, "getClientRects", { value: () => [{}] });
    document.body.appendChild(hiddenMenu);
    swipe({ clientX: 100, clientY: 300 }, { clientX: 220, clientY: 300 });
    expect(onOpen).toHaveBeenCalledTimes(1);

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    Object.defineProperty(dialog, "getClientRects", { value: () => [{}] });
    document.body.appendChild(dialog);
    swipe({ clientX: 100, clientY: 300 }, { clientX: 220, clientY: 300 });
    expect(onOpen).toHaveBeenCalledTimes(1);
    dialog.remove();

    document.body.setAttribute("data-scroll-locked", "1");
    swipe({ clientX: 100, clientY: 300 }, { clientX: 220, clientY: 300 });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("is not blocked by the closed quick menu, but is while it is expanded", () => {
    mount();
    const fan = document.createElement("div");
    fan.setAttribute("role", "menu");
    fan.setAttribute("aria-label", "Quick menu shortcuts");
    Object.defineProperty(fan, "getClientRects", { value: () => [{}] });
    const fab = document.createElement("button");
    fab.setAttribute("aria-label", "Quick menu");
    fab.setAttribute("aria-expanded", "false");
    document.body.append(fan, fab);
    swipe({ clientX: 100, clientY: 300 }, { clientX: 220, clientY: 300 });
    expect(onOpen).toHaveBeenCalledTimes(1);
    fab.setAttribute("aria-expanded", "true");
    swipe({ clientX: 100, clientY: 300 }, { clientX: 220, clientY: 300 });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("ignores a swipe while text is selected", () => {
    mount();
    const p = document.createElement("p");
    p.textContent = "Some selected words";
    document.body.appendChild(p);
    const range = document.createRange();
    range.selectNodeContents(p);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    swipe({ clientX: 100, clientY: 300 }, { clientX: 220, clientY: 300 });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("ignores a swipe on a pinch-zoomed page", () => {
    mount();
    Object.defineProperty(window, "visualViewport", { configurable: true, value: { scale: 2 } });
    swipe({ clientX: 100, clientY: 300 }, { clientX: 220, clientY: 300 });
    expect(onOpen).not.toHaveBeenCalled();
    Object.defineProperty(window, "visualViewport", { configurable: true, value: undefined });
  });

  it("stops listening when unmounted", () => {
    const { unmount } = mount();
    unmount();
    swipe({ clientX: 100, clientY: 300 }, { clientX: 220, clientY: 300 });
    expect(onOpen).not.toHaveBeenCalled();
  });
});
