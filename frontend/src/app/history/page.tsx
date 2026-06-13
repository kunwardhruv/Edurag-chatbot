"use client";
// app/history/page.tsx — Q&A History with export and delete

import { useState, useEffect } from "react";
import { Trash2, Download, Clock, BookOpen, BarChart2, ChevronDown, ChevronUp, AlertCircle, Search } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import toast from "react-hot-toast";
import clsx from "clsx";
import { fetchHistory, deleteHistoryItem, clearAllHistory, exportHistoryAsCSV, formatDate } from "@/lib/api";
import type { HistoryItem } from "@/lib/api";

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const load = () => {
    setLoading(true);
    fetchHistory(200)
      .then(setItems)
      .catch(() => toast.error("Failed to load history"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: number) => {
    try {
      await deleteHistoryItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast.success("Deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleClearAll = async () => {
    if (!confirmClear) { setConfirmClear(true); return; }
    try {
      const r = await clearAllHistory();
      setItems([]);
      toast.success(`Cleared ${r.deleted} records`);
    } catch {
      toast.error("Failed to clear");
    } finally {
      setConfirmClear(false);
    }
  };

  const filtered = items.filter((i) =>
    !search ||
    i.query.toLowerCase().includes(search.toLowerCase()) ||
    i.book_name.toLowerCase().includes(search.toLowerCase()) ||
    i.subject.toLowerCase().includes(search.toLowerCase())
  );

  const scoreColor = (s: number) =>
    s > 0.6 ? "text-emerald-400" : s > 0.4 ? "text-amber-400" : "text-orange-400";

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Q&A History</h1>
          <p className="text-text-secondary text-sm mt-1">All saved queries and answers — {items.length} total</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportHistoryAsCSV(filtered)}
            disabled={filtered.length === 0}
            className="flex items-center gap-2 bg-bg-card border border-bg-border hover:border-accent/40 text-text-primary text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-40"
          >
            <Download size={14} /> Export CSV
          </button>
          <button
            onClick={handleClearAll}
            disabled={items.length === 0}
            className={clsx(
              "flex items-center gap-2 text-sm px-4 py-2 rounded-lg border transition-colors disabled:opacity-40",
              confirmClear
                ? "bg-red-500/10 border-red-500/40 text-red-400"
                : "bg-bg-card border-bg-border hover:border-red-500/30 text-text-secondary hover:text-red-400"
            )}
          >
            <Trash2 size={14} />
            {confirmClear ? "Confirm Clear All?" : "Clear All"}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search queries, books, subjects..."
          className="w-full bg-bg-card border border-bg-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 transition-colors"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 bg-bg-card border border-bg-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-bg-card border border-bg-border rounded-xl p-12 text-center">
          <Clock size={32} className="text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary text-sm">{search ? "No results found" : "No history yet. Start chatting!"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="bg-bg-card border border-bg-border rounded-xl overflow-hidden transition-all"
            >
              {/* Summary Row */}
              <div
                className="flex items-start gap-3 px-4 py-4 cursor-pointer hover:bg-bg-hover transition-colors"
                onClick={() => setExpanded(expanded === item.id ? null : item.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary line-clamp-2">{item.query}</p>
                  <div className="flex flex-wrap gap-3 mt-2 items-center">
                    <span className="flex items-center gap-1 text-[11px] text-text-muted">
                      <BookOpen size={10} /> {item.book_name}
                    </span>
                    <span className="text-[11px] text-text-muted">Class {item.class_name} · {item.subject}</span>
                    {item.source === "threshold_filter" ? (
                      <span className="flex items-center gap-1 text-[11px] text-amber-500">
                        <AlertCircle size={10} /> Out of scope
                      </span>
                    ) : (
                      <span className={clsx("flex items-center gap-1 text-[11px]", scoreColor(item.score))}>
                        <BarChart2 size={10} /> {item.score.toFixed(3)}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-[11px] text-text-muted">
                      <Clock size={10} /> {formatDate(item.created_at)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                    className="p-1.5 text-text-muted hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10"
                  >
                    <Trash2 size={13} />
                  </button>
                  {expanded === item.id
                    ? <ChevronUp size={15} className="text-text-muted" />
                    : <ChevronDown size={15} className="text-text-muted" />
                  }
                </div>
              </div>

              {/* Expanded Answer */}
              {expanded === item.id && (
                <div className="px-4 pb-4 border-t border-bg-border pt-4 animate-slide-up">
                  <p className="text-[11px] text-text-muted font-semibold uppercase tracking-wider mb-2">Answer</p>
                  <div className="prose-chat text-sm bg-bg-secondary rounded-lg p-4">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.answer}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
