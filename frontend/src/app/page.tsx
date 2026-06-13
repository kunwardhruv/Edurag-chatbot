"use client";
// app/page.tsx — Dashboard

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Upload, History, MessageSquare, TrendingUp, Clock } from "lucide-react";
import { fetchBooks, fetchStats, formatDate } from "@/lib/api";
import type { BookMetadata } from "@/lib/api";

export default function DashboardPage() {
  const [books, setBooks] = useState<BookMetadata[]>([]);
  const [stats, setStats] = useState<{ total_queries: number; books_queried: number; recent: any[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchBooks(), fetchStats()])
      .then(([b, s]) => { setBooks(b); setStats(s); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const statCards = [
    { label: "Books Indexed", value: books.length, icon: BookOpen, color: "text-accent" },
    { label: "Total Queries", value: stats?.total_queries ?? 0, icon: MessageSquare, color: "text-emerald-400" },
    { label: "Books Queried", value: stats?.books_queried ?? 0, icon: TrendingUp, color: "text-blue-400" },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">
          Welcome to <span className="text-accent">EduRAG</span>
        </h1>
        <p className="text-text-secondary mt-1 text-sm">
          Upload any Class 1–12 textbook and ask questions. Answers come strictly from the book.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-bg-card border border-bg-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-text-muted font-medium uppercase tracking-wider">{label}</span>
              <Icon size={16} className={color} />
            </div>
            <p className={`text-3xl font-bold ${color}`}>{loading ? "—" : value}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Link href="/upload" className="bg-accent/10 border border-accent/20 hover:border-accent/40 rounded-xl p-5 flex items-center gap-4 transition-all group">
          <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
            <Upload size={18} className="text-accent" />
          </div>
          <div>
            <p className="font-semibold text-text-primary text-sm">Upload Book</p>
            <p className="text-xs text-text-muted">Process a new PDF</p>
          </div>
        </Link>
        <Link href="/chat" className="bg-bg-card border border-bg-border hover:border-accent/30 rounded-xl p-5 flex items-center gap-4 transition-all group">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <MessageSquare size={18} className="text-emerald-400" />
          </div>
          <div>
            <p className="font-semibold text-text-primary text-sm">Start Chat</p>
            <p className="text-xs text-text-muted">Ask from a book</p>
          </div>
        </Link>
        <Link href="/history" className="bg-bg-card border border-bg-border hover:border-accent/30 rounded-xl p-5 flex items-center gap-4 transition-all group">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <History size={18} className="text-blue-400" />
          </div>
          <div>
            <p className="font-semibold text-text-primary text-sm">History</p>
            <p className="text-xs text-text-muted">View saved Q&amp;A</p>
          </div>
        </Link>
      </div>

      {/* Books Grid */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4">
          Indexed Books ({books.length})
        </h2>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-bg-card border border-bg-border rounded-xl animate-pulse" />
            ))}
          </div>
        ) : books.length === 0 ? (
          <div className="bg-bg-card border border-bg-border rounded-xl p-10 text-center">
            <BookOpen size={32} className="text-text-muted mx-auto mb-3" />
            <p className="text-text-secondary text-sm">No books yet.</p>
            <Link href="/upload" className="text-accent text-sm hover:underline mt-1 inline-block">Upload your first book →</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {books.map((b) => (
              <Link
                key={b.index_name}
                href={`/chat?book=${b.index_name}`}
                className="bg-bg-card border border-bg-border hover:border-accent/30 rounded-xl p-4 flex items-start gap-3 transition-all group"
              >
                <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                  <BookOpen size={16} className="text-accent" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-text-primary text-sm truncate">{b.book_name}</p>
                  <p className="text-xs text-text-muted mt-0.5">Class {b.class} · {b.subject}</p>
                  <div className="flex gap-3 mt-1.5">
                    <span className="text-[11px] text-text-muted">{b.total_pages} pages</span>
                    <span className="text-[11px] text-text-muted">{b.total_chunks} chunks</span>
                    {b.pages_with_images > 0 && (
                      <span className="text-[11px] text-amber-500">{b.pages_with_images} diagram pages</span>
                    )}
                  </div>
                </div>
                <span className="ml-auto text-accent opacity-0 group-hover:opacity-100 text-lg">→</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      {stats?.recent && stats.recent.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4">
            Recent Activity
          </h2>
          <div className="bg-bg-card border border-bg-border rounded-xl divide-y divide-bg-border">
            {stats.recent.map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-4">
                <Clock size={14} className="text-text-muted mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-primary truncate">{item.query}</p>
                  <p className="text-xs text-text-muted mt-0.5">{item.book_name} · {formatDate(item.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
