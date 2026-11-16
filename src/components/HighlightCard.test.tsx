import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Highlight } from "@/lib/data";

const state = vi.hoisted(() => ({ user: null as { id: string } | null, isAdmin: false }));

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("@/hooks/useIsAdmin", () => ({ useIsAdmin: () => ({ isAdmin: state.isAdmin, loading: false }) }));
vi.mock("@/hooks/useHighlightSaves", () => ({
  useIsHighlightSaved: () => false,
  useToggleSave: () => ({ mutate: vi.fn() }),
  useHighlightSaveCount: () => ({ data: 0 }),
}));
vi.mock("@/hooks/useHighlightFeedback", () => ({
  useIsThumbsUp: () => false,
  useIsThumbsDown: () => false,
  useToggleThumbsUp: () => ({ mutate: vi.fn() }),
  useToggleThumbsDown: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/hooks/useAllTags", () => ({ useAllTags: () => [] }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/components/BookCover", () => ({ default: () => null }));
vi.mock("./HighlightEditPanel", () => ({
  default: (p: { mode?: string; open: boolean }) => (p.open ? <div data-testid={`panel-${p.mode ?? "full"}`} /> : null),
}));

import HighlightCard from "./HighlightCard";

const base: Highlight = {
  id: "h1",
  text: "A line worth keeping.",
  bookTitle: "Book",
  author: "Author",
  tags: [],
  source: "user",
  userId: "owner",
  displayName: "Owner",
};

const show = (h: Partial<Highlight> = {}) =>
  render(
    <MemoryRouter>
      <HighlightCard highlight={{ ...base, ...h }} />
    </MemoryRouter>,
  );

describe("HighlightCard: Add my take", () => {
  beforeEach(() => {
    state.user = null;
    state.isAdmin = false;
  });

  it("is hidden for signed-out readers and for other people's highlights", () => {
    show();
    expect(screen.queryByText("Add my take")).toBeNull();
    state.user = { id: "someone-else" };
    show();
    expect(screen.queryByText("Add my take")).toBeNull();
  });

  it("shows for the owner and for an admin, and opens the note-only editor (not the full one)", () => {
    state.user = { id: "owner" };
    show();
    fireEvent.click(screen.getByText("Add my take"));
    expect(screen.getByTestId("panel-note-only")).toBeTruthy();
    expect(screen.queryByTestId("panel-full")).toBeNull();
  });

  it("shows for an admin on someone else's highlight, next to the existing pencil", () => {
    state.user = { id: "admin-1" };
    state.isAdmin = true;
    show();
    expect(screen.getByText("Add my take")).toBeTruthy();
    expect(screen.getByLabelText("Edit highlight")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Edit highlight"));
    expect(screen.getByTestId("panel-full")).toBeTruthy();
  });

  it("reads 'Edit my take' once a note exists, and the reader's Note toggle stays", () => {
    state.user = { id: "owner" };
    show({ myNotes: "something I think" });
    expect(screen.getByText("Edit my take")).toBeTruthy();
    expect(screen.queryByText("Add my take")).toBeNull();
    expect(screen.getByText("Note")).toBeTruthy();
  });
});