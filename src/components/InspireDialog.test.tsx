import { createPortal } from "react-dom";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Highlight } from "@/lib/data";

// Stand-in card with a sheet-like portal, like the note-only editor opened from "Add my take"
vi.mock("@/components/HighlightCard", () => ({
  default: () => (
    <div>
      <button>take button</button>
      {createPortal(<div data-testid="portaled-sheet">sheet</div>, document.body)}
    </div>
  ),
}));

import InspireDialog from "./InspireDialog";

const highlight: Highlight = { id: "h1", text: "x", bookTitle: "B", author: "A", tags: [] };

const touch = (type: "touchstart" | "touchend", target: Element, x: number) => {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, "touches", { value: type === "touchend" ? [] : [{ clientX: x, clientY: 300 }] });
  Object.defineProperty(e, "changedTouches", { value: [{ clientX: x, clientY: 300 }] });
  act(() => {
    target.dispatchEvent(e);
  });
};
const swipeLeft = (target: Element) => {
  touch("touchstart", target, 260);
  touch("touchend", target, 120);
};

const setup = () => {
  const onShuffle = vi.fn();
  render(
    <MemoryRouter>
      <InspireDialog open onOpenChange={vi.fn()} loading={false} error={false} highlight={highlight} onShuffle={onShuffle} />
    </MemoryRouter>,
  );
  return onShuffle;
};

describe("InspireDialog swipe", () => {
  it("shuffles on a left swipe over the card", async () => {
    const onShuffle = setup();
    swipeLeft(screen.getByText("take button"));
    await waitFor(() => expect(onShuffle).toHaveBeenCalledTimes(1)); // after the short leave animation
  });

  it("ignores a left swipe that happens inside a sheet portaled out of the card", async () => {
    const onShuffle = setup();
    swipeLeft(screen.getByTestId("portaled-sheet"));
    await new Promise((r) => setTimeout(r, 300)); // longer than the leave animation
    expect(onShuffle).not.toHaveBeenCalled();
  });
});