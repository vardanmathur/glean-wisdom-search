import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Highlight } from "@/lib/data";

const state = vi.hoisted(() => ({ user: null as { id: string } | null, coverage: "good" as "good" | "poor" }));

const h = (id: string): Highlight => ({ id, text: `text ${id}`, bookTitle: `Book ${id}`, author: "A", tags: [], tier: "good" });

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("@/lib/data", async (orig) => ({
  ...(await orig<typeof import("@/lib/data")>()),
  searchHighlightsSemantic: async () => ({ highlights: [h("a"), h("b")], totalFound: state.coverage === "poor" ? 0 : 2, coverage: state.coverage, message: null }),
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

const show = (q = "how do i stop procrastinating at work") =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[`/search?q=${encodeURIComponent(q)}`]}>
        <SearchResults />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe("SearchResults refine box", () => {
  beforeEach(() => {
    sessionStorage.clear();
    state.user = null;
    state.coverage = "good";
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
    expect(screen.getByText("Added after refining", { selector: "h2" })).toBeTruthy();
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
});