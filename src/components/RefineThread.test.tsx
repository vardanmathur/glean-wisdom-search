import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Highlight } from "@/lib/data";
import type { RefineTurn } from "@/lib/refine";

const { refine, handler, RefineError } = vi.hoisted(() => {
  class RefineError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  // `refine` only records calls; `handler.current` supplies the result (a spy on a rejecting promise gets flagged by vitest itself)
  const handler: { current: (args: unknown) => unknown } = { current: () => undefined };
  return { refine: vi.fn(), handler, RefineError };
});

vi.mock("@/lib/data", () => ({
  refineSynthesis: (args: unknown) => {
    refine(args);
    return handler.current(args);
  },
  RefineError,
}));

import RefineThread from "./RefineThread";

const known: Highlight[] = [{ id: "h1", text: "A line", bookTitle: "Book", author: "Author", tags: [] }];
const turn = (n: number): RefineTurn => ({ context: `ctx ${n}`, answer: `answer ${n}`, searchedFor: `rewritten ${n}`, added: [] });

const setup = (turns: RefineTurn[] = []) => {
  const onTurn = vi.fn();
  const view = render(<RefineThread question="my question" synthesis="first answer" known={known} turns={turns} onTurn={onTurn} />);
  return { onTurn, ...view };
};
const box = () => screen.getByPlaceholderText("Tell Glean what's missing or specific to your situation…") as HTMLTextAreaElement;
const button = () => screen.getByRole("button", { name: /Refin/ }) as HTMLButtonElement;

describe("RefineThread", () => {
  beforeEach(() => {
    refine.mockReset();
    handler.current = () => undefined;
  });

  it("makes no call on mount or re-render, and the button is off until something is typed", () => {
    const { rerender, onTurn } = setup();
    rerender(<RefineThread question="my question" synthesis="first answer" known={known} turns={[]} onTurn={onTurn} />);
    expect(refine).not.toHaveBeenCalled();
    expect(button().disabled).toBe(true);
    fireEvent.change(box(), { target: { value: "   " } });
    expect(button().disabled).toBe(true);
  });

  it("one tap, one call, with the question, first answer, history and shown highlights; then stacks the turn", async () => {
    handler.current = async () => ({ answer: "refined", searchedFor: "better question", added: [{ id: "h2", tier: "good" }] });
    const { onTurn } = setup([turn(1)]);
    fireEvent.change(box(), { target: { value: "  I lead a team  " } });
    fireEvent.click(button());
    await waitFor(() => expect(onTurn).toHaveBeenCalledTimes(1));
    expect(refine).toHaveBeenCalledTimes(1);
    expect(refine).toHaveBeenCalledWith({
      question: "my question",
      synthesis: "first answer",
      context: "I lead a team",
      history: [{ context: "ctx 1", answer: "answer 1" }],
      highlights: known,
      coveragePoor: false,
    });
    expect(onTurn).toHaveBeenCalledWith({ context: "I lead a team", answer: "refined", searchedFor: "better question", added: [{ id: "h2", tier: "good" }] });
    await waitFor(() => expect(box().value).toBe(""));
  });

  it("tells the server when the first search had poor coverage", async () => {
    handler.current = async () => ({ answer: "a", searchedFor: "s", added: [] });
    const onTurn = vi.fn();
    render(<RefineThread question="q" synthesis="s" known={known} turns={[]} onTurn={onTurn} coveragePoor />);
    fireEvent.change(box(), { target: { value: "more" } });
    fireEvent.click(button());
    await waitFor(() => expect(onTurn).toHaveBeenCalled());
    expect(refine).toHaveBeenCalledWith(expect.objectContaining({ coveragePoor: true }));
  });

  it("is disabled while in flight, so a second tap sends nothing", async () => {
    let resolve: (v: unknown) => void = () => {};
    handler.current = () => new Promise((r) => (resolve = r));
    const { onTurn } = setup();
    fireEvent.change(box(), { target: { value: "more context" } });
    fireEvent.click(button());
    await waitFor(() => expect(button().disabled).toBe(true));
    expect(button().textContent).toMatch(/Refining/);
    fireEvent.click(button());
    fireEvent.click(button());
    expect(refine).toHaveBeenCalledTimes(1);
    resolve({ answer: "done", searchedFor: "s", added: [] });
    await waitFor(() => expect(onTurn).toHaveBeenCalledTimes(1));
  });

  it("on failure shows a message, keeps the text, does not store a turn and does not retry", async () => {
    handler.current = async () => {
      throw new RefineError("truncated");
    };
    const { onTurn } = setup();
    fireEvent.change(box(), { target: { value: "my context" } });
    fireEvent.click(button());
    expect(await screen.findByText(/cut off/)).toBeTruthy();
    await new Promise((r) => setTimeout(r, 100));
    expect(refine).toHaveBeenCalledTimes(1);
    expect(onTurn).not.toHaveBeenCalled();
    expect(box().value).toBe("my context");
    expect(button().disabled).toBe(false); // the person can tap again
  });

  it("shows each earlier turn with the context line, the answer and the rewritten question", () => {
    setup([{ ...turn(1), added: [{ id: "x", tier: "good" }, { id: "y", tier: "good" }] }, turn(2)]);
    expect(screen.getByText("ctx 1")).toBeTruthy();
    expect(screen.getByText("answer 1")).toBeTruthy();
    expect(screen.getByText("Searched again for: rewritten 1")).toBeTruthy();
    expect(screen.getByText("Searched again for: rewritten 2")).toBeTruthy();
    expect(screen.getByText("2 new highlights added below")).toBeTruthy();
  });

  it("after the third turn the box is replaced by 'Start a new search to go further'", () => {
    setup([turn(1), turn(2), turn(3)]);
    expect(screen.queryByPlaceholderText("Tell Glean what's missing or specific to your situation…")).toBeNull();
    expect(screen.queryByRole("button", { name: /Refin/ })).toBeNull();
    expect(screen.getByText("Start a new search to go further.")).toBeTruthy();
  });
});