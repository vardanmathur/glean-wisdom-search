import { describe, expect, it } from "vitest";
import {
  SLOW_READ_MS,
  appendScanText,
  readingStatus,
  scanErrorMessage,
  scanSuccessMessage,
  targetSize,
} from "./scanText";
import {
  MAX_BASE64_CHARS,
  buildInstructions,
  detectImageMime,
  parseMode,
  parseModelReply,
  validateImage,
} from "../../supabase/functions/read-text-from-image/parse";

describe("targetSize", () => {
  it("scales the long edge down to 2000, keeping the shape", () => {
    expect(targetSize(4000, 3000)).toEqual({ width: 2000, height: 1500 });
    expect(targetSize(3000, 4000)).toEqual({ width: 1500, height: 2000 });
    expect(targetSize(8000, 2000)).toEqual({ width: 2000, height: 500 });
  });

  it("never scales up", () => {
    expect(targetSize(1200, 800)).toEqual({ width: 1200, height: 800 });
    expect(targetSize(2000, 2000)).toEqual({ width: 2000, height: 2000 });
  });

  it("rounds, and always leaves at least one pixel", () => {
    expect(targetSize(3001, 1001)).toEqual({ width: 2000, height: 667 });
    expect(targetSize(0, 0)).toEqual({ width: 1, height: 1 });
    expect(targetSize(100000, 1)).toEqual({ width: 2000, height: 1 });
  });

  it("honours another limit", () => {
    expect(targetSize(1000, 500, 400)).toEqual({ width: 400, height: 200 });
  });
});

describe("appendScanText", () => {
  it("puts the first page straight in when the box is empty", () => {
    expect(appendScanText("", "  Page one text.  ")).toBe("Page one text.");
    expect(appendScanText("   ", "Page one text.")).toBe("Page one text.");
  });

  it("adds the next page after a single space", () => {
    expect(appendScanText("Page one text.", "Page two text.")).toBe("Page one text. Page two text.");
    expect(appendScanText("Page one text.   ", "  Page two text.")).toBe("Page one text. Page two text.");
  });

  it("leaves the box alone when nothing was read", () => {
    expect(appendScanText("Page one text.", "   ")).toBe("Page one text.");
    expect(appendScanText("", "")).toBe("");
  });
});

describe("messages", () => {
  it("names each error code", () => {
    expect(scanErrorMessage("credits")).toBe("AI credits exhausted");
    expect(scanErrorMessage("rate_limit")).toBe("Too many requests — wait a moment");
    expect(scanErrorMessage("failed")).toBe("Couldn't read the text — try again");
    expect(scanErrorMessage(undefined)).toBe("Couldn't read the text — try again");
  });

  it("adds the highlighted-text note only for auto mode with marks found", () => {
    expect(scanSuccessMessage(true, false)).toBe("Text read — check and edit if needed · highlighted text only");
    expect(scanSuccessMessage(true, true)).toBe("Text read — check and edit if needed");
    expect(scanSuccessMessage(false, false)).toBe("Text read — check and edit if needed");
  });
});

describe("readingStatus", () => {
  it("starts with Reading text… and explains the wait after 6 seconds", () => {
    expect(SLOW_READ_MS).toBe(6000);
    expect(readingStatus(false)).toBe("Reading text…");
    expect(readingStatus(true)).toBe("Still reading. Full pages can take 10 to 20 seconds.");
  });
});

describe("parseModelReply", () => {
  it("reads plain JSON", () => {
    expect(parseModelReply('{"marked_found": true, "text": "Marked passage."}')).toEqual({
      text: "Marked passage.",
      marked_found: true,
    });
  });

  it("reads JSON inside code fences, with or without a language tag", () => {
    const fence = "```";
    expect(parseModelReply(fence + 'json\n{"marked_found": false, "text": "All of it."}\n' + fence)).toEqual({
      text: "All of it.",
      marked_found: false,
    });
    expect(parseModelReply(fence + '\n{"marked_found": true, "text": "Hi"}\n' + fence)).toEqual({
      text: "Hi",
      marked_found: true,
    });
  });

  it("finds the JSON when the model adds words around it", () => {
    expect(parseModelReply('Here you go: {"marked_found": true, "text": "Quoted."} Hope that helps.')).toEqual({
      text: "Quoted.",
      marked_found: true,
    });
  });

  it("keeps real paragraph breaks and drops carriage returns", () => {
    const reply = JSON.stringify({ marked_found: false, text: "One." + String.fromCharCode(13, 10, 13, 10) + "Two." });
    expect(parseModelReply(reply).text).toBe("One." + String.fromCharCode(10, 10) + "Two.");
  });

  it("falls back to the raw text when the JSON is broken or not JSON at all", () => {
    expect(parseModelReply('{"marked_found": true, "text": "cut off')).toEqual({
      text: '{"marked_found": true, "text": "cut off',
      marked_found: false,
    });
    expect(parseModelReply("Just the page text, no JSON.")).toEqual({
      text: "Just the page text, no JSON.",
      marked_found: false,
    });
  });

  it("falls back when the JSON has no text field", () => {
    expect(parseModelReply('{"marked_found": true}').marked_found).toBe(false);
  });

  it("treats a non-string or empty reply as no text", () => {
    expect(parseModelReply(undefined)).toEqual({ text: "", marked_found: false });
    expect(parseModelReply(null)).toEqual({ text: "", marked_found: false });
    expect(parseModelReply("")).toEqual({ text: "", marked_found: false });
    expect(parseModelReply('{"marked_found": false, "text": ""}')).toEqual({ text: "", marked_found: false });
  });
});

describe("request checks (edge function)", () => {
  const jpeg = "/9j/4AAQSkZJRgABAQ";
  const png = "iVBORw0KGgoAAAANSUhEUg";

  it("accepts JPEG and PNG base64 and names the type", () => {
    expect(detectImageMime(jpeg)).toBe("image/jpeg");
    expect(detectImageMime(png)).toBe("image/png");
    expect(validateImage(jpeg)).toBeNull();
    expect(validateImage(png)).toBeNull();
  });

  it("rejects other formats, data URLs, junk characters, empty and non-strings", () => {
    expect(validateImage("R0lGODlhAQABAIAAAAAAAP")).toMatch(/JPEG or PNG/);
    expect(validateImage("data:image/jpeg;base64," + jpeg)).toMatch(/JPEG or PNG/);
    expect(validateImage(jpeg + " !!")).toMatch(/base64/);
    expect(validateImage("")).toMatch(/required/);
    expect(validateImage(undefined)).toMatch(/required/);
    expect(validateImage(42)).toMatch(/required/);
  });

  it("rejects an image over the size limit", () => {
    expect(validateImage(jpeg + "A".repeat(MAX_BASE64_CHARS))).toMatch(/too large/);
  });

  it("defaults the mode to auto and rejects unknown modes", () => {
    expect(parseMode(undefined)).toBe("auto");
    expect(parseMode("all")).toBe("all");
    expect(parseMode("auto")).toBe("auto");
    expect(parseMode("everything")).toBeNull();
  });

  it("puts the mode and the key rules in the instructions", () => {
    const auto = buildInstructions("auto");
    expect(auto).toContain("handwritten note exactly as written");
    expect(auto).toContain("[illegible]");
    expect(auto).toContain("Do not guess");
    expect(auto).toContain("Handwritten margin notes are not highlighting");
    expect(auto).toContain("Treat single line breaks as spaces");
    expect(auto).toContain("Use a blank line only where a clearly new paragraph starts");
    expect(auto).toContain("Ignore empty ruled lines in notebooks");
    expect(buildInstructions("all")).toContain("Do not guess");
    expect(auto).toContain("MODE auto");
    expect(auto.endsWith("MODE auto")).toBe(true);
    expect(buildInstructions("all").endsWith("MODE all")).toBe(true);
  });
});
