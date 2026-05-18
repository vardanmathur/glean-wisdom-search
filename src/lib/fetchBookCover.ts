// Shared cover-lookup helper. Tries Open Library by title+author first,
// then falls back to Google Books. Returns null when nothing found.
export const fetchBookCover = async (
  title: string,
  author: string,
): Promise<string | null> => {
  try {
    const ol = await fetch(
      `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}&limit=1`,
    );
    if (ol.ok) {
      const oj = await ol.json();
      const coverId = oj.docs?.[0]?.cover_i;
      if (coverId) return `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;
    }
  } catch { /* ignore */ }
  try {
    const gb = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(title + " " + author)}&maxResults=1`,
    );
    if (gb.ok) {
      const gj = await gb.json();
      return gj.items?.[0]?.volumeInfo?.imageLinks?.thumbnail ?? null;
    }
  } catch { /* ignore */ }
  return null;
};
