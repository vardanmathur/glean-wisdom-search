// Pure helpers for the Scan text flow (photo -> crop -> AI reads the text). Nothing here touches the image itself.

export const MAX_SCAN_EDGE = 2000;
export const SCAN_JPEG_QUALITY = 0.85;

export interface Size {
  width: number;
  height: number;
}

// Scales a size down so its long edge is at most `maxEdge`; never scales up.
export function targetSize(width: number, height: number, maxEdge: number = MAX_SCAN_EDGE): Size {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const long = Math.max(w, h);
  if (long <= maxEdge) return { width: w, height: h };
  const scale = maxEdge / long;
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

// Adds a page of text to what is already in the quote box: it goes straight in when the box is empty,
// otherwise after a single space. Nothing already typed is overwritten.
export function appendScanText(existing: string, added: string): string {
  const next = added.trim();
  if (!next) return existing;
  const current = existing.trimEnd();
  return current.trim() ? `${current} ${next}` : next;
}

export type ScanErrorCode = "credits" | "rate_limit" | "failed";

export function scanErrorMessage(code: ScanErrorCode | string | undefined): string {
  if (code === "credits") return "AI credits exhausted";
  if (code === "rate_limit") return "Too many requests — wait a moment";
  return "Couldn't read the text — try again";
}

export function scanSuccessMessage(markedFound: boolean, readAll: boolean): string {
  return "Text read — check and edit if needed" + (markedFound && !readAll ? " · highlighted text only" : "");
}
