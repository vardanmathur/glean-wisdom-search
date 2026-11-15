import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: null, signOut: vi.fn() }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: () => false }) }));
vi.mock("@/hooks/useIsAdmin", () => ({ useIsAdmin: () => ({ isAdmin: false, loading: false }) }));

import Navbar from "./Navbar";

const Probe = () => {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <span data-testid="path">{location.pathname}</span>
      <button onClick={() => navigate(-1)}>phone back</button>
    </div>
  );
};

const setup = () =>
  render(
    <MemoryRouter initialEntries={["/start", "/"]} initialIndex={1}>
      <Navbar />
      <Probe />
    </MemoryRouter>,
  );

const openMenu = () => {
  fireEvent.click(screen.getByLabelText("Open menu"));
  return screen.getByRole("dialog");
};

const swipeLeft = (el: Element) => {
  const start = new Event("touchstart", { bubbles: true });
  Object.defineProperty(start, "touches", { value: [{ clientX: 250, clientY: 300 }] });
  el.dispatchEvent(start);
  const end = new Event("touchend", { bubbles: true });
  Object.defineProperty(end, "touches", { value: [] });
  Object.defineProperty(end, "changedTouches", { value: [{ clientX: 120, clientY: 300 }] });
  el.dispatchEvent(end);
};

describe("Navbar mobile menu", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("puts the items at the bottom on phones and keeps the sheet scrollable from the top", () => {
    setup();
    const dialog = openMenu();
    const topics = within(dialog).getByText("Topics");
    const items = topics.parentElement as HTMLElement; // the block of menu items
    expect(items.className).toContain("max-sm:mt-auto");
    expect(items.className).not.toContain("justify-end");
    const scroller = items.parentElement as HTMLElement;
    expect(scroller.className).toContain("overflow-y-auto");
    expect(scroller.className).toContain("min-h-0");
    expect(scroller.className).not.toContain("justify-end");
    expect(dialog.contains(scroller)).toBe(true);
    // the close button sits on the sheet itself, outside the scrolling part
    const close = within(dialog).getByText("Close").closest("button") as HTMLElement;
    expect(scroller.contains(close)).toBe(false);
  });

  it("closes on a swipe to the left", async () => {
    setup();
    const dialog = openMenu();
    act(() => swipeLeft(dialog));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("closes on the phone's Back button and stays on the page", async () => {
    setup();
    openMenu();
    fireEvent.click(screen.getByText("phone back"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("path").textContent).toBe("/");
  });

  it("choosing an item does not leave an extra Back step", async () => {
    setup();
    const dialog = openMenu();
    fireEvent.click(within(dialog).getByText("Topics"));
    await waitFor(() => expect(screen.getByTestId("path").textContent).toBe("/topics"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // one Back returns to the page you opened the menu on, a second goes to the one before it
    fireEvent.click(screen.getByText("phone back"));
    await waitFor(() => expect(screen.getByTestId("path").textContent).toBe("/"));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByText("phone back"));
    await waitFor(() => expect(screen.getByTestId("path").textContent).toBe("/start"));
  });
});
