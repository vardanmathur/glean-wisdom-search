export interface DuplicateCandidate {
  id: string;
  title: string;
  author: string;
}

export interface DuplicateBookGroup<T extends DuplicateCandidate> {
  key: string;
  rows: T[];
}

const NUMBER_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
};

const MIN_PREFIX_LENGTH = 8;

export function normaliseTitle(title: string): string {
  let t = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  t = t.replace(/&/g, " and ");
  const cut = t.search(/\s[-–—]\s|[:([]/);
  if (cut >= 0) t = t.slice(0, cut);
  t = t.replace(/-/g, " ").replace(/[^\p{L}\p{M}\p{N}\s]/gu, "");
  t = t.replace(/\s+/g, " ").trim().replace(/^(the|a|an) /, "");
  return t
    .split(" ")
    .map((w) => NUMBER_WORDS[w] ?? w)
    .join(" ")
    .trim();
}

export function authorSurname(author: string): string {
  const a = author.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s,]/gu, "").trim();
  if (a.includes(",")) return a.split(",")[0].trim();
  const words = a.split(/\s+/).filter(Boolean);
  return words[words.length - 1] ?? "";
}

// The shorter title must be a whole-word prefix of the longer one.
function isWordPrefix(shorter: string, longer: string): boolean {
  return longer === shorter || longer.startsWith(shorter + " ");
}

export function findDuplicateGroups<T extends DuplicateCandidate>(books: T[]): DuplicateBookGroup<T>[] {
  const norm = books.map((b) => normaliseTitle(b.title));
  const sur = books.map((b) => authorSurname(b.author));
  const parent = books.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };

  for (let i = 0; i < books.length; i++) {
    if (!norm[i]) continue;
    for (let j = i + 1; j < books.length; j++) {
      if (!norm[j]) continue;
      if (norm[i] === norm[j]) {
        union(i, j);
        continue;
      }
      if (!sur[i] || sur[i] !== sur[j]) continue;
      const [short, long] = norm[i].length <= norm[j].length ? [norm[i], norm[j]] : [norm[j], norm[i]];
      if (short.length >= MIN_PREFIX_LENGTH && isWordPrefix(short, long)) union(i, j);
    }
  }

  const byRoot = new Map<number, T[]>();
  books.forEach((b, i) => {
    if (!norm[i]) return;
    const r = find(i);
    byRoot.set(r, [...(byRoot.get(r) ?? []), b]);
  });
  return [...byRoot.values()]
    .filter((rows) => rows.length >= 2)
    .map((rows) => ({ key: rows.map((r) => r.id).reduce((a, b) => (b < a ? b : a)), rows }));
}
