// lib/api.ts — All API calls to the FastAPI backend

const BASE = "http://localhost:8000/api";

export interface BookMetadata {
  class: string;
  subject: string;
  book_name: string;
  total_chunks: number;
  index_name: string;
  total_pages: number;
  pages_with_images: number;
  total_images: number;
}

export interface QueryResult {
  id: number;
  answer: string;
  score: number;
  chunks_used: number;
  source: "llm" | "threshold_filter";
  book_name: string;
  class: string;
  subject: string;
}

export interface HistoryItem {
  id: number;
  query: string;
  answer: string;
  book_name: string;
  class_name: string;
  subject: string;
  score: number;
  chunks_used: number;
  source: string;
  created_at: string;
}

// ── Books ──────────────────────────────────────────────────────

export async function fetchBooks(): Promise<BookMetadata[]> {
  try {
    const res = await fetch(`${BASE}/books`);
    if (!res.ok) throw new Error();
    return res.json();
  } catch {
    return [];
  }
}

export async function processBook(
  file: File,
  className: string,
  subject: string,
  bookName: string
): Promise<{ success: boolean; index_name: string; stats: Record<string, number> }> {
  const form = new FormData();
  form.append("file", file);
  form.append("class_name", className);
  form.append("subject", subject);
  form.append("book_name", bookName);

  const res = await fetch(`${BASE}/books/process`, { method: "POST", body: form });
  if (!res.ok) {
    try {
      const err = await res.json();
      throw new Error(err.detail || "Failed to process book");
    } catch {
      throw new Error(`Backend error (${res.status}): ${res.statusText || "Unknown error"}`);
    }
  }
  return res.json();
}

export async function deleteBook(indexName: string): Promise<void> {
  const res = await fetch(`${BASE}/books/${indexName}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete book");
}

// ── Query ──────────────────────────────────────────────────────

export async function queryBook(
  query: string,
  indexName: string,
  groqApiKey?: string
): Promise<QueryResult> {
  const key = groqApiKey || (typeof window !== "undefined" ? localStorage.getItem("groq_api_key") || "" : "");
  const res = await fetch(`${BASE}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, index_name: indexName, groq_api_key: key }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Query failed");
  }
  return res.json();
}

// ── History ────────────────────────────────────────────────────

export async function fetchHistory(limit = 50, offset = 0): Promise<HistoryItem[]> {
  try {
    const res = await fetch(`${BASE}/history?limit=${limit}&offset=${offset}`);
    if (!res.ok) throw new Error();
    return res.json();
  } catch {
    return [];
  }
}

export async function deleteHistoryItem(id: number): Promise<void> {
  const res = await fetch(`${BASE}/history/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete item");
}

export async function clearAllHistory(): Promise<{ deleted: number }> {
  const res = await fetch(`${BASE}/history`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to clear history");
  return res.json();
}

export async function fetchStats(): Promise<{
  total_queries: number;
  books_queried: number;
  recent: Array<{ query: string; book_name: string; created_at: string }>;
}> {
  try {
    const res = await fetch(`${BASE}/stats`);
    if (!res.ok) throw new Error();
    return res.json();
  } catch {
    return { total_queries: 0, books_queried: 0, recent: [] };
  }
}

export async function fetchConfig(): Promise<{ classes: string[]; subjects: string[] }> {
  try {
    const res = await fetch(`${BASE}/config`);
    if (!res.ok) throw new Error();
    return res.json();
  } catch {
    return {
      classes: ["1","2","3","4","5","6","7","8","9","10","11","12"],
      subjects: [
        "Mathematics","Science","Physics","Chemistry","Biology",
        "English","Hindi","History","Geography","Civics",
        "Economics","Computer Science","Political Science",
        "Accountancy","Business Studies","Sanskrit","Other"
      ]
    };
  }
}

// ── Helpers ────────────────────────────────────────────────────

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

export function exportHistoryAsCSV(items: HistoryItem[]): void {
  const header = "ID,Query,Answer,Book,Class,Subject,Score,Date\n";
  const rows = items
    .map(i =>
      [i.id, `"${i.query.replace(/"/g, '""')}"`, `"${i.answer.replace(/"/g, '""')}"`,
       `"${i.book_name}"`, i.class_name, i.subject, i.score.toFixed(3), i.created_at]
      .join(",")
    )
    .join("\n");

  const blob = new Blob([header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `edurag_history_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}