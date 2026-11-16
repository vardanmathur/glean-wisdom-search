import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Highlight } from "@/lib/data";

const { eq, update, refreshAfterEdit } = vi.hoisted(() => {
  const eq = vi.fn(async () => ({ error: null }));
  const update = vi.fn(() => ({ eq }));
  return { eq, update, refreshAfterEdit: vi.fn() };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ update }), functions: { invoke: vi.fn() } },
}));
vi.mock("@/lib/refreshFingerprint", () => ({ refreshFingerprintAfterEdit: refreshAfterEdit }));

import HighlightEditPanel from "./HighlightEditPanel";

const highlight: Highlight = {
  id: "h1",
  text: "The obstacle is the way.",
  bookTitle: "Some Book",
  author: "Some Author",
  tags: ["Stoicism"],
  myNotes: "old note",
  visibility: "public",
};

const draftKey = (suffix: string) => `glean_card_edit_draft_h1_${suffix}`;

const setup = (mode: "full" | "note-only" | undefined, extra: Partial<Highlight> = {}) => {
  const onOpenChange = vi.fn();
  const onSaved = vi.fn();
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <HighlightEditPanel
        mode={mode}
        highlight={{ ...highlight, ...extra }}
        allTags={["Stoicism", "Courage"]}
        open
        onOpenChange={onOpenChange}
        onSaved={onSaved}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange, onSaved, ...view };
};

describe("HighlightEditPanel", () => {
  beforeEach(() => {
    sessionStorage.clear();
    update.mockClear();
    eq.mockClear();
    refreshAfterEdit.mockClear();
  });

  describe("full mode (default)", () => {
    it("shows the quote editor, tags, notes and visibility, and saves all four fields", async () => {
      const { onOpenChange } = setup(undefined);
      expect(screen.getByText("Edit Highlight")).toBeTruthy();
      expect(screen.getByDisplayValue("The obstacle is the way.").tagName).toBe("TEXTAREA");
      expect(screen.getByPlaceholderText("Add tag…")).toBeTruthy();
      expect(screen.getByText("Visibility")).toBeTruthy();
      fireEvent.change(screen.getByPlaceholderText("Add your notes…"), { target: { value: "new note" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
      expect(update).toHaveBeenCalledWith({
        quote: "The obstacle is the way.",
        tags: ["Stoicism"],
        my_notes: "new note",
        visibility: "public",
      });
      expect(eq).toHaveBeenCalledWith("id", "h1");
      expect(refreshAfterEdit).toHaveBeenCalledTimes(1);
    });

    it("an explicit mode='full' behaves the same", () => {
      setup("full");
      expect(screen.getByText("Edit Highlight")).toBeTruthy();
      expect(screen.getByPlaceholderText("Add tag…")).toBeTruthy();
    });
  });

  describe("note-only mode", () => {
    it("shows the quote read-only, hides tags, visibility and the quote editor, and focuses the note", async () => {
      setup("note-only");
      expect(screen.getByText("My take")).toBeTruthy();
      const quote = screen.getByText("The obstacle is the way.");
      expect(quote.tagName).toBe("BLOCKQUOTE");
      expect(screen.queryByPlaceholderText("Add tag…")).toBeNull();
      expect(screen.queryByText("Visibility")).toBeNull();
      expect(screen.queryByText("Suggest tags")).toBeNull();
      const notes = screen.getByPlaceholderText("Add your notes…");
      expect((notes as HTMLTextAreaElement).value).toBe("old note");
      await waitFor(() => expect(document.activeElement).toBe(notes));
    });

    it("saves only the note, then triggers the fingerprint refresh with the old values", async () => {
      const { onOpenChange, onSaved } = setup("note-only", { visibility: undefined });
      const save = screen.getByRole("button", { name: "Save take" }) as HTMLButtonElement;
      expect(save.disabled).toBe(true); // nothing changed yet
      fireEvent.change(screen.getByPlaceholderText("Add your notes…"), { target: { value: "  my take  " } });
      expect(save.disabled).toBe(false);
      fireEvent.click(save);
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
      // only my_notes: no visibility flip, no quote or tag writes
      expect(update).toHaveBeenCalledWith({ my_notes: "my take" });
      expect(refreshAfterEdit).toHaveBeenCalledWith(
        "h1",
        { quote: "The obstacle is the way.", tags: ["Stoicism"], my_notes: "old note" },
        { my_notes: "my take" },
      );
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(sessionStorage.getItem(draftKey("notes"))).not.toContain("my take"); // draft cleared on save
    });

    it("clearing the note saves null", async () => {
      const { onOpenChange } = setup("note-only");
      fireEvent.change(screen.getByPlaceholderText("Add your notes…"), { target: { value: "" } });
      fireEvent.click(screen.getByRole("button", { name: "Save take" }));
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
      expect(update).toHaveBeenCalledWith({ my_notes: null });
    });
  });

  describe("drafts", () => {
    it("both modes write the same draft keys for the same highlight", () => {
      const a = setup("note-only");
      fireEvent.change(screen.getByPlaceholderText("Add your notes…"), { target: { value: "typed in take" } });
      expect(JSON.parse(sessionStorage.getItem(draftKey("notes")) as string)).toBe("typed in take");
      a.unmount();
      setup("full");
      fireEvent.change(screen.getByPlaceholderText("Add your notes…"), { target: { value: "typed in full" } });
      expect(JSON.parse(sessionStorage.getItem(draftKey("notes")) as string)).toBe("typed in full");
      // one set of keys, no mode-specific copies
      const keys = Object.keys(sessionStorage).filter((k) => k.includes("glean_card_edit_draft"));
      expect(keys.every((k) => k.startsWith("glean_card_edit_draft_h1_"))).toBe(true);
    });

    it("Cancel on an edited note asks first; Keep editing keeps the draft, Discard clears it", async () => {
      const { onOpenChange } = setup("note-only");
      fireEvent.change(screen.getByPlaceholderText("Add your notes…"), { target: { value: "half a thought" } });
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(await screen.findByText("Discard unsaved changes?")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
      await waitFor(() => expect(screen.queryByText("Discard unsaved changes?")).toBeNull());
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(JSON.parse(sessionStorage.getItem(draftKey("notes")) as string)).toBe("half a thought");
      expect((screen.getByPlaceholderText("Add your notes…") as HTMLTextAreaElement).value).toBe("half a thought");

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      fireEvent.click(await screen.findByRole("button", { name: "Discard" }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(sessionStorage.getItem(draftKey("notes")) ?? "").not.toContain("half a thought");
    });

    it("a draft written before a page reload is picked up by the state hook, then re-synced from the server on open (same as full mode)", () => {
      sessionStorage.setItem(draftKey("notes"), JSON.stringify("left over"));
      setup("note-only");
      // The panel always re-hydrates from the saved highlight on open (existing behaviour, unchanged)
      expect((screen.getByPlaceholderText("Add your notes…") as HTMLTextAreaElement).value).toBe("old note");
    });
  });
});