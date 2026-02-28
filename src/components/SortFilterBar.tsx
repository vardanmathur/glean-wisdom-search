import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type SortOption = "name-asc" | "most-highlights" | "fewest-highlights" | "longest" | "shortest";

interface SortFilterBarProps {
  sort: SortOption;
  onSortChange: (value: SortOption) => void;
}

const SortFilterBar = ({ sort, onSortChange }: SortFilterBarProps) => {
  return (
    <div className="flex items-center gap-3 mb-6">
      <span className="text-sm text-muted-foreground">Sort by</span>
      <Select value={sort} onValueChange={(v) => onSortChange(v as SortOption)}>
        <SelectTrigger className="w-[200px] h-9 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="name-asc">Name (A–Z)</SelectItem>
          <SelectItem value="most-highlights">Most Highlights</SelectItem>
          <SelectItem value="fewest-highlights">Fewest Highlights</SelectItem>
          <SelectItem value="longest">Longest Highlights</SelectItem>
          <SelectItem value="shortest">Shortest Highlights</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};

export default SortFilterBar;
