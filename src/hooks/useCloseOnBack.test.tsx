import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { overlayStep, useCloseOnBack } from "./useCloseOnBack";

describe("overlayStep", () => {
  it("pushes once when the overlay opens", () => {
    expect(overlayStep("idle", { open: true, markerPresent: false })).toEqual({ phase: "pushing", action: "push" });
    expect(overlayStep("idle", { open: false, markerPresent: false })).toEqual({ phase: "idle", action: null });
  });

  it("waits for the router before treating the marker as missing", () => {
    expect(overlayStep("pushing", { open: true, markerPresent: false })).toEqual({ phase: "pushing", action: null });
    expect(overlayStep("pushing", { open: true, markerPresent: true })).toEqual({ phase: "active", action: null });
  });

  it("removes the entry if the overlay closed before the router reported it", () => {
    expect(overlayStep("pushing", { open: false, markerPresent: true })).toEqual({ phase: "idle", action: "pop" });
  });

  it("treats a vanished marker while open as Back", () => {
    expect(overlayStep("active", { open: true, markerPresent: false })).toEqual({ phase: "backed", action: "close" });
  });

  it("pops once when closed any other way, and never after Back", () => {
    expect(overlayStep("active", { open: false, markerPresent: true })).toEqual({ phase: "idle", action: "pop" });
    expect(overlayStep("active", { open: false, markerPresent: false })).toEqual({ phase: "idle", action: null });
    expect(overlayStep("backed", { open: true, markerPresent: false })).toEqual({ phase: "backed", action: null });
    expect(overlayStep("backed", { open: false, markerPresent: false })).toEqual({ phase: "idle", action: null });
  });
});

const Harness = ({ onClose, startOpen = false }: { onClose: () => void; startOpen?: boolean }) => {
  const [open, setOpen] = useState(startOpen);
  const location = useLocation();
  const navigate = useNavigate();
  useCloseOnBack(open, () => {
    onClose();
    setOpen(false);
  });
  return (
    <div>
      <span data-testid="path">{location.pathname}</span>
      <span data-testid="overlay">{String((location.state as { overlay?: string } | null)?.overlay ?? "")}</span>
      <span data-testid="open">{String(open)}</span>
      <button onClick={() => setOpen(true)}>open</button>
      <button onClick={() => setOpen(false)}>close</button>
      <button onClick={() => navigate(-1)}>back</button>
    </div>
  );
};

const setup = (entries: Parameters<typeof MemoryRouter>[0]["initialEntries"], startOpen = false) => {
  const onClose = vi.fn();
  render(
    <MemoryRouter initialEntries={entries} initialIndex={(entries?.length ?? 1) - 1}>
      <Harness onClose={onClose} startOpen={startOpen} />
    </MemoryRouter>,
  );
  return onClose;
};

const click = (name: string) => act(() => void fireEvent.click(screen.getByText(name)));

describe("useCloseOnBack", () => {
  it("adds a history entry for the same URL when the overlay opens", () => {
    setup(["/start", "/page"]);
    expect(screen.getByTestId("overlay").textContent).toBe("");
    click("open");
    expect(screen.getByTestId("path").textContent).toBe("/page");
    expect(screen.getByTestId("overlay").textContent).not.toBe("");
  });

  it("closes the overlay on Back and stays on the page", () => {
    const onClose = setup(["/start", "/page"]);
    click("open");
    click("back");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("open").textContent).toBe("false");
    expect(screen.getByTestId("path").textContent).toBe("/page");
    expect(screen.getByTestId("overlay").textContent).toBe("");
  });

  it("removes its entry exactly once when closed another way", () => {
    const onClose = setup(["/start", "/page"]);
    click("open");
    click("close");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("path").textContent).toBe("/page");
    expect(screen.getByTestId("overlay").textContent).toBe("");
    // a real Back from here goes to the previous page, so no entry was left behind or over-popped
    click("back");
    expect(screen.getByTestId("path").textContent).toBe("/start");
  });

  it("works for repeated open and close", () => {
    const onClose = setup(["/start", "/page"]);
    click("open");
    click("back");
    click("open");
    click("close");
    click("open");
    click("back");
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("path").textContent).toBe("/page");
    click("back");
    expect(screen.getByTestId("path").textContent).toBe("/start");
  });

  it("does not open anything from a page that still carries the marker", () => {
    const onClose = setup(["/start", { pathname: "/page", state: { overlay: "old" } }]);
    expect(screen.getByTestId("open").textContent).toBe("false");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("overlay").textContent).toBe("old");
  });

  it("handles an overlay that is open from the first render", () => {
    const onClose = setup(["/start", "/page"], true);
    expect(screen.getByTestId("overlay").textContent).not.toBe("");
    click("back");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("path").textContent).toBe("/page");
  });
});
