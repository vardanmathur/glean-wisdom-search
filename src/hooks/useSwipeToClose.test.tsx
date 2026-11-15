import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSwipeToClose } from "./useSwipeToClose";

type Point = { clientX: number; clientY: number };

function touch(type: "touchstart" | "touchend", target: EventTarget, points: Point[], changed: Point[] = points) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, "touches", { value: type === "touchend" ? [] : points });
  Object.defineProperty(e, "changedTouches", { value: changed });
  target.dispatchEvent(e);
}

const swipe = (from: Point, to: Point, target: EventTarget) => {
  touch("touchstart", target, [from]);
  touch("touchend", target, [], [to]);
};

describe("useSwipeToClose", () => {
  let sheet: HTMLDivElement;
  let link: HTMLAnchorElement;
  let onClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = "";
    sheet = document.createElement("div");
    link = document.createElement("a");
    sheet.appendChild(link);
    document.body.appendChild(sheet);
    onClose = vi.fn();
  });
  afterEach(() => window.getSelection()?.removeAllRanges());

  const mount = (el: HTMLElement | null = sheet) => renderHook(() => useSwipeToClose(el, onClose));

  it("closes on a clear swipe to the left, wherever it starts on the sheet (links included)", () => {
    mount();
    swipe({ clientX: 250, clientY: 300 }, { clientX: 150, clientY: 310 }, sheet);
    swipe({ clientX: 250, clientY: 300 }, { clientX: 150, clientY: 310 }, link);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("uses the same thresholds as the open swipe: 70px and more than twice the vertical movement", () => {
    mount();
    swipe({ clientX: 250, clientY: 300 }, { clientX: 181, clientY: 300 }, sheet); // 69px
    swipe({ clientX: 250, clientY: 300 }, { clientX: 110, clientY: 380 }, sheet); // 140 vs 80: 1.75x
    swipe({ clientX: 250, clientY: 300 }, { clientX: 150, clientY: 350 }, sheet); // exactly 2x
    swipe({ clientX: 250, clientY: 300 }, { clientX: 250, clientY: 500 }, sheet); // vertical scroll
    expect(onClose).not.toHaveBeenCalled();
    swipe({ clientX: 250, clientY: 300 }, { clientX: 180, clientY: 300 }, sheet); // 70px
    swipe({ clientX: 250, clientY: 300 }, { clientX: 100, clientY: 360 }, sheet); // 150 vs 60
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("does not close on a swipe to the right", () => {
    mount();
    swipe({ clientX: 100, clientY: 300 }, { clientX: 220, clientY: 300 }, sheet);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ignores swipes that start on inputs and sliders", () => {
    mount();
    const input = document.createElement("input");
    const slider = document.createElement("div");
    slider.setAttribute("role", "slider");
    const thumb = document.createElement("span");
    slider.appendChild(thumb);
    sheet.append(input, slider);
    for (const target of [input, slider, thumb]) {
      swipe({ clientX: 250, clientY: 300 }, { clientX: 120, clientY: 300 }, target);
    }
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ignores a swipe while text is selected", () => {
    mount();
    const p = document.createElement("p");
    p.textContent = "Some selected words";
    sheet.appendChild(p);
    const range = document.createRange();
    range.selectNodeContents(p);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    swipe({ clientX: 250, clientY: 300 }, { clientX: 120, clientY: 300 }, sheet);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("needs a single finger", () => {
    mount();
    touch("touchstart", sheet, [
      { clientX: 250, clientY: 300 },
      { clientX: 200, clientY: 300 },
    ]);
    touch("touchend", sheet, [], [{ clientX: 120, clientY: 300 }]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does nothing while the sheet is closed (no element) or after it unmounts", () => {
    mount(null);
    swipe({ clientX: 250, clientY: 300 }, { clientX: 120, clientY: 300 }, sheet);
    expect(onClose).not.toHaveBeenCalled();
    const { unmount } = mount();
    unmount();
    swipe({ clientX: 250, clientY: 300 }, { clientX: 120, clientY: 300 }, sheet);
    expect(onClose).not.toHaveBeenCalled();
  });
});
