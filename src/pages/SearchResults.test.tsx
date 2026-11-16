import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Highlight } from "@/lib/data";

const state = vi.hoisted(() => ({ user: null as { id: string } | null, coverage: "good" as "good" | "poor", ids: ["a", "b"], totalFound: null as number | null }));

const h = (id: string): Highlight => ({ id, text: `text ${id}`, bookTitle: `Book ${id}`, author: "A", tags: [], tier: "good" });

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("@/lib/data", async (orig) => ({
  ...(await orig<typeof import("@/lib/data")>()),
  searchHighlightsSemantic: async () => ({
    highlights: state.ids.map(h),
    totalFound: state.totalFound ?? (state.coverage === "poor" ? 0 : state.ids.length),
    coverage: state.coverage,
    message: null,
  }),
  synthesiseWisdom: async () => "WHAT THE BOOKS SUGGEST\nFirst answer.",
  getRecommendedBooks: async () => [],
  fetchHighlightsByIds: async (added: { id: string }[]) => added.map((a) => h(a.id)),
  refineSynthesis: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({}) }) },
}));
vi.mock("@/components/HighlightCard", () => ({ default: ({ highlight }: { highlight: Highlight }) => <div>card {highlight.id}</div> }));
vi.mock("@/components/BookCover", () => ({ default: () => null }));
vi.mock("@/components/BookCard", () => ({ default: () => null }));
vi.mock("@/components/DownloadWorksheetButton", () => ({ default: () => null }));

import SearchResults from "./SearchResults";

const PLACEHOLDER = "Tell Glean what's missing or specific to your situation…";

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const ui = (q = "how do i stop procrastinating at work") =>
  (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/search?q=${encodeURIComponent(q)}`]}>
        <SearchResults />
      </MemoryRouter>
    </QueryClientProvider>
  );
const show = (q = "how do i stop procrastinating at work") => render(ui(q));

describe("SearchResults refine box", () => {
  beforeEach(() => {
    sessionStorage.clear();
    client.clear();
    state.user = null;
    state.coverage = "good";
    state.ids = ["a", "b"];
    state.totalFound = null;
  });

  it("is hidden when signed out", async () => {
    show();
    await screen.findByText("card a");
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByPlaceholderText(PLACEHOLDER)).toBeNull();
  });

  it("shows when signed in, once the first answer is ready", async () => {
    state.user = { id: "u1" };
    show();
    expect(await screen.findByPlaceholderText(PLACEHOLDER)).toBeTruthy();
  });

  it("restores earlier turns from the session and lists the highlights they added, marked", async () => {
    state.user = { id: "u1" };
    const q = "how do i stop procrastinating at work";
    sessionStorage.setItem(
      `glean_refine_${q}`,
      JSON.stringify([{ context: "I lead a team", answer: "Refined answer here.", searchedFor: "procrastinating as a lead", added: [{ id: "z", tier: "good" }, { id: "a", tier: "good" }] }]),
    );
    show(q);
    expect(await screen.findByText("Refined answer here.")).toBeTruthy();
    expect(screen.getByText("Searched again for: procrastinating as a lead")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("card z")).toBeTruthy());
    expect(screen.getByText("Added after refining (1)", { selector: "h2" })).toBeTruthy();
    // "a" was already in the original results, so it is not listed twice
    expect(screen.getAllByText("card a")).toHaveLength(1);
  });

  it("also shows on poor-coverage searches (signed in), and stays hidden when signed out", async () => {
    state.coverage = "poor";
    state.user = { id: "u1" };
    const first = show();
    expect(await screen.findByPlaceholderText(PLACEHOLDER)).toBeTruthy();
    first.unmount();
    state.user = null;
    show();
    await screen.findByText("card a");
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByPlaceholderText(PLACEHOLDER)).toBeNull();
  });

  it("lists refinement additions on a poor-coverage search too", async () => {
    state.coverage = "poor";
    state.user = { id: "u1" };
    const q = "how do i stop procrastinating at work";
    sessionStorage.setItem(`glean_refine_${q}`, JSON.stringify([{ context: "x", answer: "Poor refined answer.", searchedFor: "s", added: [{ id: "z", tier: "good" }] }]));
    show(q);
    expect(await screen.findByText("Poor refined answer.")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("card z")).toBeTruthy());
  });

  it("keeps each search's refinements apart", async () => {
    state.user = { id: "u1" };
    sessionStorage.setItem("glean_refine_other query", JSON.stringify([{ context: "x", answer: "Other search answer", searchedFor: "s", added: [] }]));
    show("how do i stop procrastinating at work");
    await screen.findByPlaceholderText(PLACEHOLDER);
    expect(screen.queryByText("Other search answer")).toBeNull();
  });

  describe("keyboard: the refine box is not rebuilt once it is showing", () => {
    it("keeps the same text box when the sign-in state flickers (phone resume, token refresh)", async () => {
      state.user = { id: "u1" };
      const view = show();
      const before = await screen.findByPlaceholderText(PLACEHOLDER);
      before.focus();
      state.user = null; // transient null user
      view.rerender(ui());
      state.user = { id: "u1" };
      view.rerender(ui());
      const after = screen.getByPlaceholderText(PLACEHOLDER);
      expect(after).toBe(before);
      expect(document.activeElement).toBe(before);
    });

    it("keeps the same text box on a poor-coverage search too", async () => {
      state.coverage = "poor";
      state.user = { id: "u1" };
      const view = show();
      const before = await screen.findByPlaceholderText(PLACEHOLDER);
      state.user = null;
      view.rerender(ui());
      expect(screen.getByPlaceholderText(PLACEHOLDER)).toBe(before);
    });
  });

  describe("count and lists", () => {
    it("the count is the number of highlights in the list, even when the search counted differently", async () => {
      state.ids = ["a", "b", "c"];
      state.totalFound = 2; // e.g. keyword search counts only strong matches but lists weaker ones too
      show();
      expect(await screen.findByText("3 highlights found")).toBeTruthy();
      expect(screen.getAllByText(/^card /)).toHaveLength(3);
    });

    it("says 'top N of M' when the search found more than it lists", async () => {
      state.ids = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
      state.totalFound = 12;
      show();
      expect(await screen.findByText("Showing the top 10 of 12 highlights")).toBeTruthy();
      expect(screen.getAllByText(/^card /)).toHaveLength(10);
    });

    it("never lists the same highlight twice, and counts the list as shown", async () => {
      state.ids = ["a", "a", "b"];
      show();
      expect(await screen.findByText("2 highlights found")).toBeTruthy();
      expect(screen.getAllByText("card a")).toHaveLength(1);
    });

    it("main list is exactly the original results; added highlights appear only under their own counted heading", async () => {
      state.user = { id: "u1" };
      state.ids = ["a", "b", "c", "d", "e", "f", "g"];
      const q = "how do i stop procrastinating at work";
      sessionStorage.setItem(
        `glean_refine_${q}`,
        JSON.stringify([
          { context: "x", answer: "Refined.", searchedFor: "s", added: [{ id: "n1", tier: "good" }, { id: "n2", tier: "good" }, { id: "a", tier: "good" }] },
          { context: "y", answer: "Refined 2.", searchedFor: "s2", added: [{ id: "n2", tier: "good" }, { id: "n3", tier: "good" }, { id: "n4", tier: "good" }] },
        ]),
      );
      show(q);
      expect(await screen.findByText("7 highlights found")).toBeTruthy();
      const heading = await screen.findByText("Added after refining (4)", { selector: "h2" });
      const cards = screen.getAllByText(/^card /);
      const order = cards.map((el) => el.textContent);
      expect(order).toEqual(["card a", "card b", "card c", "card d", "card e", "card f", "card g", "card n1", "card n2", "card n3", "card n4"]);
      // all seven originals come before the heading, all four additions after it
      const before = cards.filter((el) => heading.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING);
      expect(before).toHaveLength(7);
    });
  });
});
