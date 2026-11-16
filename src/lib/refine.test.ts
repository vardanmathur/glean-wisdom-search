import { describe, expect, it } from "vitest";
import {
  MAX_REFINE_TURNS,
  addedAcrossTurns,
  canRefine,
  cleanContext,
  historyForRequest,
  refineErrorMessage,
  turnsLeft,
  foundLabel,
  uniqueById,
  type RefineTurn,
} from "./refine";

const turn = (n: number, ids: string[] = []): RefineTurn => ({
  context: `ctx ${n}`,
  answer: `ans ${n}`,
  searchedFor: `q ${n}`,
  added: ids.map((id) => ({ id, tier: "good" as const })),
});

describe("turn cap", () => {
  it("allows 3 turns, then stops", () => {
    expect(MAX_REFINE_TURNS).toBe(3);
    expect(canRefine([])).toBe(true);
    expect(canRefine([turn(1), turn(2)])).toBe(true);
    expect(turnsLeft([turn(1), turn(2)])).toBe(1);
    expect(canRefine([turn(1), turn(2), turn(3)])).toBe(false);
    expect(turnsLeft([turn(1), turn(2), turn(3), turn(4)])).toBe(0);
  });
});

describe("cleanContext", () => {
  it("trims, returns empty for blanks, and cuts at the limit", () => {
    expect(cleanContext("  hello  ")).toBe("hello");
    expect(cleanContext("   ")).toBe("");
    expect(cleanContext("a".repeat(1500))).toHaveLength(1000);
  });
});

describe("history and added highlights", () => {
  it("history carries context and answer only", () => {
    expect(historyForRequest([turn(1, ["a"])])).toEqual([{ context: "ctx 1", answer: "ans 1" }]);
  });

  it("collects added highlights across turns once each, skipping ones already in the original results", () => {
    const out = addedAcrossTurns([turn(1, ["a", "b"]), turn(2, ["b", "c", "orig"])], ["orig"]);
    expect(out.map((a) => a.id)).toEqual(["a", "b", "c"]);
  });
});

describe("refineErrorMessage", () => {
  it("has a clear message for each known failure and a safe default", () => {
    expect(refineErrorMessage("truncated")).toMatch(/cut off/);
    expect(refineErrorMessage("sign_in")).toMatch(/Sign in/);
    expect(refineErrorMessage("nonsense")).toMatch(/Couldn't refine/);
    expect(refineErrorMessage(undefined)).toMatch(/Couldn't refine/);
  });
});
describe("uniqueById and foundLabel", () => {
  it("keeps the first of each id", () => {
    expect(uniqueById([{ id: "a" }, { id: "b" }, { id: "a" }]).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("describes the list on screen", () => {
    expect(foundLabel(1, 1)).toBe("1 highlight found");
    expect(foundLabel(7, 7)).toBe("7 highlights found");
    expect(foundLabel(7, 5)).toBe("7 highlights found");
    expect(foundLabel(10, 14)).toBe("Showing the top 10 of 14 highlights");
    expect(foundLabel(10, 10)).toBe("10 highlights found");
    expect(foundLabel(3, 12)).toBe("3 highlights found"); // a count that disagrees with the list never wins
  });
});
