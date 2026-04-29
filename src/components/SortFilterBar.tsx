import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type SortOption =
  | "name-asc"
  | "most-highlights"
  | "fewest-highlights"
  | "longest"
  | "shortest"
  | "most-saved";

const ALL_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "most-saved", label: "Most Saved" },
  { value: "name-asc", label: "Name (A–Z)" },
  { value: "most-highlights", label: "Most Highlights" },
  { value: "fewest-highlights", label: "Fewest Highlights" },
  { value: "longest", label: "Longest Highlights" },
  { value: "shortest", label: "Shortest Highlights" },
];

interface SortFilterBarProps {
  sort: SortOption;
  onSortChange: (value: SortOption) => void;
  /** Optional subset of options to show. Defaults to the original 5 (excludes most-saved). */
  options?: SortOption[];
}

const DEFAULT_OPTIONS: SortOption[] = [
  "name-asc",
  "most-highlights",
  "fewest-highlights",
  "longest",
  "shortest",
];

const SortFilterBar = ({ sort, onSortChange, options = DEFAULT_OPTIONS }: SortFilterBarProps) => {
  const visible = ALL_OPTIONS.filter((opt) => options.includes(opt.value));

  return (
    <div className="flex items-center gap-3 mb-6">
      <span className="text-sm text-muted-foreground">Sort by</span>
      <Select value={sort} onValueChange={(v) => onSortChange(v as SortOption)}>
        <SelectTrigger className="w-[200px] h-9 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {visible.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default SortFilterBar;
