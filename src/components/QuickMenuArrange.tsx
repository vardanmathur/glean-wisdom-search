import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { QuickMenuItem } from "@/lib/quickMenu";

interface QuickMenuArrangeProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: QuickMenuItem[];
  onMove: (index: number, delta: -1 | 1) => void;
  onReset: () => void;
}

// "Arrange quick menu": the order here is the order on the arc, top to bottom.
const QuickMenuArrange = ({ open, onOpenChange, items, onMove, onReset }: QuickMenuArrangeProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Arrange quick menu</DialogTitle>
        <DialogDescription>Top of the list is the top of the fan. Changes apply straight away.</DialogDescription>
      </DialogHeader>

      <ul className="min-w-0 space-y-2">
        {items.map((item, i) => {
          const Icon = item.icon;
          return (
            <li key={item.id} className="flex min-w-0 items-center gap-2 rounded-lg border bg-card p-2">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 break-words text-sm font-medium text-foreground">{item.label}</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0"
                disabled={i === 0}
                onClick={() => onMove(i, -1)}
                aria-label={`Move ${item.label} up`}
              >
                <ChevronUp className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0"
                disabled={i === items.length - 1}
                onClick={() => onMove(i, 1)}
                aria-label={`Move ${item.label} down`}
              >
                <ChevronDown className="h-5 w-5" />
              </Button>
            </li>
          );
        })}
      </ul>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" onClick={onReset} className="h-11 sm:h-9">
          Reset to default
        </Button>
        <Button type="button" onClick={() => onOpenChange(false)} className="h-11 sm:h-9">
          Done
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export default QuickMenuArrange;
