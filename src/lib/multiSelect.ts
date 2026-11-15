// Small pure helpers for a multi-select filter (used for the Books filter in Admin Studio).

export interface SelectOption {
  id: string;
  label: string;
}

// The text on the closed filter button: "All books", the book's title, or "Books (3)".
export function multiSelectLabel(selected: string[], options: SelectOption[], emptyLabel: string, manyPrefix: string): string {
  if (selected.length === 0) return emptyLabel;
  if (selected.length === 1) return options.find((o) => o.id === selected[0])?.label ?? `${manyPrefix} (1)`;
  return `${manyPrefix} (${selected.length})`;
}

export function toggleId(selected: string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
}

// Options whose label contains the search text (case-insensitive), titles that start with it first.
export function filterOptions(options: SelectOption[], search: string): SelectOption[] {
  const q = search.trim().toLowerCase();
  if (!q) return options;
  return options
    .filter((o) => o.label.toLowerCase().includes(q))
    .sort((a, b) => {
      const aStarts = a.label.toLowerCase().startsWith(q);
      const bStarts = b.label.toLowerCase().startsWith(q);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
}
