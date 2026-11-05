import { useEffect, useState } from "react";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { coverCandidates, needsCaching, placeholderTone, queueCoverCache } from "@/lib/coverCache";
import { cn } from "@/lib/utils";

interface BookCoverProps {
  title: string;
  author?: string | null;
  /** The original cover link (books.cover_image_url). */
  sourceUrl?: string | null;
  /** Our stored copy (books.cover_cached_url) and the original it was made from. */
  cachedUrl?: string | null;
  cachedFrom?: string | null;
  /** When given, an admin viewing a missing or stale copy queues this book for background caching. */
  bookId?: string | null;
  /** Size, rounding and so on for the frame. The frame always clips its content. */
  className?: string;
  imgClassName?: string;
  textClassName?: string;
  /** Tiny thumbnails: the placeholder shows only the first letter of the title. */
  compact?: boolean;
}

// One place that shows a book cover: our stored copy, else the original link, else a soft coloured card
// with the title. A broken-image icon is never shown.
const BookCover = ({
  title,
  author,
  sourceUrl,
  cachedUrl,
  cachedFrom,
  bookId,
  className,
  imgClassName,
  textClassName,
  compact,
}: BookCoverProps) => {
  const { isAdmin } = useIsAdmin();
  const candidates = coverCandidates({ sourceUrl, cachedUrl, cachedFrom });
  const key = candidates.join("|");

  // How many sources have already failed for this exact set of candidates.
  const [failed, setFailed] = useState({ key, count: 0 });
  const count = failed.key === key ? failed.count : 0;
  const src = candidates[count];

  useEffect(() => {
    if (isAdmin && bookId && needsCaching({ sourceUrl, cachedUrl, cachedFrom })) queueCoverCache(bookId);
  }, [isAdmin, bookId, sourceUrl, cachedUrl, cachedFrom]);

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {src ? (
        <img
          key={src}
          src={src}
          alt={author ? `${title} by ${author}` : title}
          loading="lazy"
          className={imgClassName ?? "h-full w-full object-cover"}
          onError={() => setFailed({ key, count: count + 1 })}
        />
      ) : (
        <div
          role="img"
          aria-label={title}
          className={cn(
            "flex h-full min-h-[inherit] w-full items-center justify-center p-1 text-center font-medium",
            placeholderTone(title),
          )}
        >
          <span className={cn(compact ? "text-sm" : "line-clamp-4 break-words text-[10px] leading-tight", textClassName)}>
            {compact ? title.trim().charAt(0).toUpperCase() || "?" : title}
          </span>
        </div>
      )}
    </div>
  );
};

export default BookCover;
