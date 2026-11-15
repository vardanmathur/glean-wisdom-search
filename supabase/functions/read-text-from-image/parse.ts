// Pure helpers for read-text-from-image. No Deno or network code here, so the unit tests can import this file.

export type ReadMode = "auto" | "all";

export interface ReadResult {
  text: string;
  marked_found: boolean;
}

// About 3 MB of image data once base64 is decoded.
export const MAX_BASE64_CHARS = 4_000_000;

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

// A JPEG starts with the bytes FF D8 FF, a PNG with 89 50 4E 47: in base64 those are these prefixes.
export function detectImageMime(base64: string): "image/jpeg" | "image/png" | null {
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("iVBORw0KGgo")) return "image/png";
  return null;
}

// null when the image is acceptable, otherwise a short reason.
export function validateImage(image: unknown): string | null {
  if (typeof image !== "string" || image.length === 0) return "image is required";
  if (image.length > MAX_BASE64_CHARS) return "image is too large";
  if (!detectImageMime(image)) return "image must be a JPEG or PNG";
  for (let i = 0; i < image.length; i++) {
    if (!BASE64_CHARS.includes(image[i])) return "image is not valid base64";
  }
  return null;
}

export function parseMode(mode: unknown): ReadMode | null {
  if (mode === undefined || mode === null) return "auto";
  return mode === "auto" || mode === "all" ? mode : null;
}

export function buildInstructions(mode: ReadMode): string {
  return [
    "Transcribe the text in this image of a book page, e-reader screen, or handwritten note exactly as written.",
    "The text may be printed or handwritten. For handwriting, transcribe as faithfully as you can; write [illegible] for any word you cannot read. Do not guess.",
    "Do not correct, modernise, summarise or reword anything; keep spelling and punctuation.",
    "Join words hyphenated across a line break, and join lines into paragraphs, keeping real paragraph breaks.",
    "Treat single line breaks as spaces. Use a blank line only where a clearly new paragraph starts. Ignore empty ruled lines in notebooks.",
    "Leave out running headers, page numbers, footnote numbers and partial words cut off at the image edges.",
    "MODE auto: if any text is marked (highlighter or e-reader highlight colour, or underlined), return ONLY the marked text, in reading order, joining separate marked spans with a space. If nothing is marked, return all the text. Handwritten margin notes are not highlighting; only treat highlighter colour, e-reader highlight colour or underlining of the main text as marking.",
    "MODE all: return all the text, ignoring any marking.",
    'Reply with JSON only: {"marked_found": true|false, "text": "..."}.',
    'If there is no readable text, reply {"marked_found": false, "text": ""}.',
    "",
    "MODE " + mode,
  ].join(String.fromCharCode(10));
}

const FENCE = "```";
const CR = String.fromCharCode(13);

function stripFences(raw: string): string {
  let s = raw.trim();
  if (s.startsWith(FENCE)) {
    const firstNewline = s.indexOf(String.fromCharCode(10));
    s = firstNewline >= 0 ? s.slice(firstNewline + 1) : s.slice(FENCE.length);
    s = s.trim();
    if (s.endsWith(FENCE)) s = s.slice(0, -FENCE.length).trim();
  }
  return s;
}

const clean = (t: string) => t.split(CR).join("").trim();

function fromObject(value: unknown): ReadResult | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { text?: unknown; marked_found?: unknown };
  if (typeof v.text !== "string") return null;
  return { text: clean(v.text), marked_found: v.marked_found === true };
}

// The model is asked for JSON, but may wrap it in code fences, add words around it, or ignore the format.
// Anything that is not usable JSON falls back to the raw text, with marked_found false.
export function parseModelReply(raw: unknown): ReadResult {
  if (typeof raw !== "string") return { text: "", marked_found: false };
  const stripped = stripFences(raw);
  try {
    const direct = fromObject(JSON.parse(stripped));
    if (direct) return direct;
  } catch {
    /* not plain JSON: try the part between the first { and the last } */
  }
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const inner = fromObject(JSON.parse(stripped.slice(start, end + 1)));
      if (inner) return inner;
    } catch {
      /* fall through to the raw text */
    }
  }
  return { text: clean(stripped), marked_found: false };
}
