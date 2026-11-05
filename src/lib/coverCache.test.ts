import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { coverCandidates, createCoverQueue, isCacheCurrent, needsCaching, placeholderTone } from "./coverCache";

describe("isCacheCurrent / needsCaching", () => {
  it("trusts a copy only while it matches the current original", () => {
    expect(isCacheCurrent({ sourceUrl: "a", cachedUrl: "c", cachedFrom: "a" })).toBe(true);
    expect(isCacheCurrent({ sourceUrl: "b", cachedUrl: "c", cachedFrom: "a" })).toBe(false);
    expect(isCacheCurrent({ sourceUrl: "a", cachedUrl: null, cachedFrom: "a" })).toBe(false);
    expect(isCacheCurrent({ sourceUrl: null, cachedUrl: "c", cachedFrom: "a" })).toBe(false);
  });

  it("needs caching when there is an original without a current copy", () => {
    expect(needsCaching({ sourceUrl: "a" })).toBe(true);
    expect(needsCaching({ sourceUrl: "b", cachedUrl: "c", cachedFrom: "a" })).toBe(true);
    expect(needsCaching({ sourceUrl: "a", cachedUrl: "c", cachedFrom: "a" })).toBe(false);
  });

  it("needs clearing when the original is gone but a copy is recorded", () => {
    expect(needsCaching({ sourceUrl: null, cachedUrl: "c", cachedFrom: "a" })).toBe(true);
    expect(needsCaching({ sourceUrl: "", cachedUrl: null, cachedFrom: "a" })).toBe(true);
    expect(needsCaching({ sourceUrl: null, cachedUrl: null, cachedFrom: null })).toBe(false);
    expect(needsCaching({})).toBe(false);
  });
});

describe("coverCandidates", () => {
  it("tries the stored copy, then the original", () => {
    expect(coverCandidates({ sourceUrl: "a", cachedUrl: "c", cachedFrom: "a" })).toEqual(["c", "a"]);
  });

  it("skips a stale copy", () => {
    expect(coverCandidates({ sourceUrl: "b", cachedUrl: "c", cachedFrom: "a" })).toEqual(["b"]);
  });

  it("has nothing to try without an original", () => {
    expect(coverCandidates({ sourceUrl: null, cachedUrl: "c", cachedFrom: "a" })).toEqual([]);
    expect(coverCandidates({})).toEqual([]);
  });
});

describe("placeholderTone", () => {
  it("is stable for a title and always returns a class string", () => {
    expect(placeholderTone("Atomic Habits")).toBe(placeholderTone("Atomic Habits"));
    expect(placeholderTone("")).toMatch(/bg-/);
  });
});

describe("createCoverQueue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const ids = (n: number) => Array.from({ length: n }, (_, i) => `b${i}`);

  it("requests each id at most once per session", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const q = createCoverQueue(send);
    q.enqueue("a");
    q.enqueue("a");
    q.enqueue("b");
    await vi.advanceTimersByTimeAsync(200);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(["a", "b"]);
    q.enqueue("a");
    await vi.advanceTimersByTimeAsync(200);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("batches up to 10 ids per call", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const q = createCoverQueue(send, { concurrency: 5 });
    ids(25).forEach((id) => q.enqueue(id));
    await vi.advanceTimersByTimeAsync(200);
    expect(send.mock.calls.map((c) => c[0].length)).toEqual([10, 10, 5]);
  });

  it("runs at most 2 calls at a time and continues as they finish", async () => {
    let inFlight = 0;
    let peak = 0;
    const releases: (() => void)[] = [];
    const send = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          inFlight++;
          peak = Math.max(peak, inFlight);
          releases.push(() => {
            inFlight--;
            resolve();
          });
        }),
    );
    const q = createCoverQueue(send);
    ids(45).forEach((id) => q.enqueue(id));
    await vi.advanceTimersByTimeAsync(200);
    expect(send).toHaveBeenCalledTimes(2);
    expect(peak).toBe(2);
    releases[0]();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(3);
    expect(peak).toBe(2);
    while (releases.length < 5) {
      releases[releases.length - 1]();
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(send).toHaveBeenCalledTimes(5);
    expect(peak).toBe(2);
  });

  it("never throws, logs failures, and does not retry the same id", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const send = vi.fn().mockRejectedValue(new Error("boom"));
    const q = createCoverQueue(send);
    expect(() => q.enqueue("a")).not.toThrow();
    await vi.advanceTimersByTimeAsync(200);
    expect(send).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalled();
    q.enqueue("a");
    await vi.advanceTimersByTimeAsync(200);
    expect(send).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("flushNow sends without waiting for the batch window", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const q = createCoverQueue(send);
    q.enqueue("a");
    q.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledWith(["a"]);
  });

  it("ignores empty ids", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const q = createCoverQueue(send);
    q.enqueue("");
    await vi.advanceTimersByTimeAsync(200);
    expect(send).not.toHaveBeenCalled();
  });
});
