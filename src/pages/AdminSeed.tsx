import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface ParsedRow {
  record_id: string;
  book_title: string;
  author: string;
  quote: string;
  tags: string[];
  location?: string;
  stars?: boolean;
  highlight_date?: string;
  char_length?: number;
  blogged?: boolean;
  my_notes?: string;
  isbn?: string;
  cover_image_url?: string;
}

function parseBookField(bookField: string): { title: string; author: string } {
  // Format: "Title (Author)" or "Title (Author, First)"
  const match = bookField.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (match) {
    return { title: match[1].trim(), author: match[2].trim() };
  }
  return { title: bookField, author: "Unknown" };
}

const AdminSeed = () => {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [seeding, setSeeding] = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target?.result;
      const workbook = XLSX.read(data, { type: "binary" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

      const parsed: ParsedRow[] = json
        .filter((row) => row.Quote && row.Book && row.Type === "Highlight")
        .map((row) => {
          const { title, author } = parseBookField(row.Book || "");
          const tagsStr = (row.Tags || "") as string;
          const tags = tagsStr
            .split(",")
            .map((t: string) => t.trim())
            .filter(Boolean);

          return {
            record_id: row.RecordID || crypto.randomUUID().slice(0, 8),
            book_title: title,
            author,
            quote: (row.Quote || "").replace(/<br\/?>/g, "\n"),
            tags,
            location: row.Location || undefined,
            stars: row.Stars === true || row.Stars === "TRUE",
            highlight_date: row.Date ? new Date(row.Date).toISOString() : undefined,
            char_length: row.Length ? Number(row.Length) : undefined,
            blogged: row.Blogged === true || row.Blogged === "TRUE",
            my_notes: row["My Notes"]
              ? String(row["My Notes"]).replace(/<br\/?>/g, "\n")
              : undefined,
            isbn: row.ISBN ? String(row.ISBN) : undefined,
            cover_image_url: row.Image ? String(row.Image) : undefined,
          };
        });

      setRows(parsed);
      setStatus(`Parsed ${parsed.length} highlights from ${new Set(parsed.map(r => r.book_title)).size} books`);
    };
    reader.readAsBinaryString(file);
  };

  const handleSeed = async () => {
    if (rows.length === 0) return;
    setSeeding(true);
    setProgress(0);

    const batchSize = 100;
    let totalInserted = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      try {
        const { data, error } = await supabase.functions.invoke("seed-highlights", {
          body: { rows: batch },
        });
        if (error) {
          errors.push(`Batch ${i}: ${error.message}`);
        } else {
          totalInserted += data?.highlights_inserted || 0;
        }
      } catch (err: any) {
        errors.push(`Batch ${i}: ${err.message}`);
      }
      setProgress(Math.round(((i + batchSize) / rows.length) * 100));
    }

    setProgress(100);
    setStatus(
      `Done! Inserted ${totalInserted} highlights. ${errors.length > 0 ? `Errors: ${errors.join("; ")}` : "No errors."}`
    );
    setSeeding(false);
  };

  return (
    <div className="container mx-auto max-w-xl px-4 py-12">
      <h1 className="font-display text-2xl text-foreground mb-6">Seed Database</h1>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Upload Kindle Highlights Excel
          </label>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFile}
            className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
          />
        </div>

        {rows.length > 0 && (
          <>
            <p className="text-sm text-muted-foreground">{status}</p>
            <Button onClick={handleSeed} disabled={seeding} className="w-full">
              {seeding ? "Seeding..." : `Seed ${rows.length} highlights`}
            </Button>
          </>
        )}

        {seeding && <Progress value={progress} className="w-full" />}

        {progress === 100 && !seeding && (
          <p className="text-sm text-primary font-medium">{status}</p>
        )}
      </div>
    </div>
  );
};

export default AdminSeed;
