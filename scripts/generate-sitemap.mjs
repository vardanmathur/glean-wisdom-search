// Build-time sitemap generator. Run: `node scripts/generate-sitemap.mjs` (or `npm run sitemap`).
// Writes public/sitemap.xml. Uses paginated .range() reads — never select("*"), never reads embedding column.
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";
import { config } from "dotenv";

config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SITE_URL = "https://glean-wisdom-from-books.lovable.app";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const today = new Date().toISOString().slice(0, 10);

async function fetchAllTags() {
  const PAGE = 1000;
  const tagSet = new Set();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("highlights")
      .select("tags")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      for (const tag of row.tags || []) {
        const t = String(tag).trim();
        if (t) tagSet.add(t);
      }
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return Array.from(tagSet).sort();
}

async function fetchAllBookTitles() {
  const PAGE = 1000;
  const titles = new Set();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("books")
      .select("title")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      const t = String(row.title || "").trim();
      if (t) titles.add(t);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return Array.from(titles).sort();
}

function urlEntry(loc, priority) {
  return `  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

async function main() {
  console.log("Fetching tags…");
  const tags = await fetchAllTags();
  console.log(`  ${tags.length} distinct tags`);
  console.log("Fetching books…");
  const books = await fetchAllBookTitles();
  console.log(`  ${books.length} books`);

  const entries = [];
  entries.push(urlEntry(`${SITE_URL}/`, "1.0"));
  entries.push(urlEntry(`${SITE_URL}/topics`, "0.8"));
  entries.push(urlEntry(`${SITE_URL}/books`, "0.8"));
  for (const tag of tags) {
    entries.push(urlEntry(`${SITE_URL}/topics/${encodeURIComponent(tag)}`, "0.8"));
  }
  for (const title of books) {
    entries.push(urlEntry(`${SITE_URL}/book/${encodeURIComponent(title)}`, "0.8"));
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join("\n")}
</urlset>
`;

  writeFileSync("public/sitemap.xml", xml);
  console.log(`Wrote public/sitemap.xml with ${entries.length} URLs`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
