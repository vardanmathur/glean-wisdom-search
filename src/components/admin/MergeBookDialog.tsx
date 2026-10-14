import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export interface MergeBookInfo {
  id: string;
  title: string;
  author: string;
}

interface PreviewSide {
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  highlight_count: number;
}

interface MergePreview {
  success: boolean;
  error?: string;
  source?: PreviewSide;
  target?: PreviewSide;
  highlights_to_move?: number;
  visibility?: { public?: number; private?: number; other?: number };
  summary_action?: "none" | "discard_source" | "move_source";
  fields_to_fill?: string[];
  warnings?: string[];
}

export interface MergeResult {
  success: boolean;
  error?: string;
  moved_highlights?: number;
  deleted_source?: boolean;
  filled_fields?: string[];
  summary_action?: string;
  source_title?: string;
  source_author?: string;
  target_id?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceBook: MergeBookInfo | null;
  targetBook: MergeBookInfo | null;
  onMerged: (result: MergeResult) => void;
}

const FIELD_LABEL: Record<string, string> = { isbn: "ISBN", cover_image_url: "cover image" };
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const MergeBookDialog = ({ open, onOpenChange, sourceBook, targetBook, onMerged }: Props) => {
  const ready = open && !!sourceBook && !!targetBook;

  const preview = useQuery({
    queryKey: ["book-merge-preview", sourceBook?.id, targetBook?.id],
    enabled: ready,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("preview_book_merge", {
        source_book_id: sourceBook!.id,
        target_book_id: targetBook!.id,
      });
      if (error) throw error;
      const result = data as unknown as MergePreview;
      if (!result?.success) throw new Error(result?.error ?? "Could not preview this merge");
      return result;
    },
  });

  const mergeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("merge_books", {
        source_book_id: sourceBook!.id,
        target_book_id: targetBook!.id,
      });
      if (error) throw error;
      const result = data as unknown as MergeResult;
      if (!result?.success) throw new Error(result?.error ?? "Merge failed");
      return result;
    },
    onSuccess: (result) => onMerged(result),
    onError: (e) => {
      console.error("[MergeBook] merge failed", e);
      toast.error(e instanceof Error ? e.message : "Merge failed");
    },
  });

  // A failed preview is shown in the dialog and as a toast, once per attempt.
  useEffect(() => {
    if (preview.error) {
      console.error("[MergeBook] preview failed", preview.error);
      toast.error(preview.error instanceof Error ? preview.error.message : "Could not preview this merge");
    }
  }, [preview.error]);

  const data = preview.data;
  const moveCount = data?.highlights_to_move ?? 0;
  const vis = data?.visibility;
  const fields = (data?.fields_to_fill ?? []).map((f) => FIELD_LABEL[f] ?? f);
  const busy = mergeMutation.isPending;

  return (
    <AlertDialog open={open} onOpenChange={(o) => (busy ? undefined : onOpenChange(o))}>
      <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Merge books</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-left">
              {preview.isLoading && (
                <div className="flex items-center gap-2 py-4 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking what will move…
                </div>
              )}

              {preview.isError && (
                <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive break-words">
                  {preview.error instanceof Error ? preview.error.message : "Could not preview this merge"}
                </p>
              )}

              {data && data.source && data.target && (
                <>
                  <p className="text-sm text-foreground break-words">
                    Move {plural(moveCount, "highlight")} from{" "}
                    <span className="font-medium">&lsquo;{data.source.title}&rsquo;</span> by {data.source.author} into{" "}
                    <span className="font-medium">&lsquo;{data.target.title}&rsquo;</span> by {data.target.author}.
                  </p>

                  {vis && (
                    <p className="text-sm text-muted-foreground">
                      {vis.public ?? 0} public &middot; {vis.private ?? 0} private
                      {(vis.other ?? 0) > 0 ? ` · ${vis.other} other` : ""}
                    </p>
                  )}

                  {(data.warnings ?? []).map((w, i) => (
                    <p
                      key={i}
                      className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200 break-words"
                    >
                      {w}
                    </p>
                  ))}

                  {fields.length > 0 && (
                    <p className="text-sm text-foreground">
                      The kept book has no {fields.join(" or ")}, so it will be filled in from the other book.
                    </p>
                  )}

                  {data.summary_action === "discard_source" && (
                    <p className="text-sm text-foreground">
                      The kept book&rsquo;s summary stays; the other book&rsquo;s summary is discarded.
                    </p>
                  )}
                  {data.summary_action === "move_source" && (
                    <p className="text-sm text-foreground">
                      The other book&rsquo;s summary moves across to the kept book.
                    </p>
                  )}

                  <p className="text-sm font-medium text-foreground">
                    The source book will be deleted. This can&rsquo;t be undone.
                  </p>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!data || !data.target || preview.isLoading || preview.isError || busy}
            onClick={() => mergeMutation.mutate()}
            className="break-words whitespace-normal h-auto"
          >
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {data?.target
              ? `Merge ${plural(moveCount, "highlight")} into ${data.target.title}`
              : "Merge"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default MergeBookDialog;
