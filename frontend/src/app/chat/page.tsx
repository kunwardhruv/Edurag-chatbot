"use client";
// app/chat/page.tsx — Main chat interface with hybrid search + page citations

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Send, BookOpen, ChevronDown, AlertCircle, BarChart2, Trash2, Zap, FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import toast from "react-hot-toast";
import clsx from "clsx";
import { fetchBooks, queryBook } from "@/lib/api";
import type { BookMetadata } from "@/lib/api";
import Link from "next/link";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: {
    score: number;
    chunks_used: number;
    source: string;
    pages_referenced?: number[];
    from_cache?: boolean;
  };
  loading?: boolean;
}

const SAMPLE_QUESTIONS = [
  "What is photosynthesis?",
  "Explain Newton's laws of motion",
  "What causes earthquakes?",
  "Who was Mahatma Gandhi?",
];

function ChatContent() {
  const searchParams = useSearchParams();
  const initialBook = searchParams.get("book");

  const [books, setBooks] = useState<BookMetadata[]>([]);
  const [selectedBook, setSelectedBook] = useState<string>(initialBook || "");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  // ❌ REMOVED: apiKey state — backend reads from .env directly
  const [showBookPicker, setShowBookPicker] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchBooks().then(setBooks).catch(() => {});
    // ❌ REMOVED: setApiKey(localStorage.getItem("groq_api_key") || "")
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const currentBook = books.find((b) => b.index_name === selectedBook);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    if (!selectedBook) return toast.error("Select a book first");
    // ❌ REMOVED: if (!apiKey) check — backend .env handles it

    const query = input.trim();
    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: query };
    const loadingMsg: Message = { id: `l-${Date.now()}`, role: "assistant", content: "", loading: true };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setInput("");
    setSending(true);

    try {
      // ❌ REMOVED: apiKey param — api.ts sends empty, backend falls back to .env
      const result = await queryBook(query, selectedBook);
      setMessages((prev) =>
        prev.map((m) =>
          m.loading
            ? {
                id: m.id,
                role: "assistant",
                content: result.answer,
                meta: {
                  score: result.score,
                  chunks_used: result.chunks_used,
                  source: result.source,
                  pages_referenced: (result as any).pages_referenced || [],
                  from_cache: (result as any).from_cache || false,
                },
              }
            : m
        )
      );
    } catch (err: any) {
      setMessages((prev) => prev.filter((m) => !m.loading));
      toast.error(err.message || "Query failed");
    } finally {
      setSending(false);
    }
  };

  const clearChat = () => { setMessages([]); toast.success("Chat cleared"); };

  const scoreColor = (s: number) =>
    s > 0.6 ? "text-emerald-400" : s > 0.4 ? "text-amber-400" : "text-orange-400";
  const scoreLabel = (s: number) =>
    s > 0.6 ? "High" : s > 0.4 ? "Medium" : "Low";

  return (
    <div className="flex flex-col h-screen">
      {/* ── Top Bar ──
          ✅ FIX: backdrop-blur REMOVED from top bar.
          WHY: backdrop-blur creates a CSS stacking context that traps z-index.
          The book picker dropdown couldn't escape above the backdrop overlay.
          Using solid bg color instead — looks identical, works correctly.
      -->*/}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-bg-border bg-bg-secondary shrink-0">

        {/* ✅ FIX: z-[60] added to this wrapper.
            WHY: This creates a stacking context at z=60, which is above the
            backdrop (z-50 below). Dropdown items are now always clickable. -->*/}
        <div className="relative z-[60]">
          <button
            onClick={() => setShowBookPicker((v) => !v)}
            className="flex items-center gap-2 bg-bg-card border border-bg-border hover:border-accent/40 rounded-lg px-3 py-2 text-sm transition-colors"
          >
            <BookOpen size={15} className="text-accent shrink-0" />
            <span className="max-w-48 truncate text-text-primary font-medium">
              {currentBook ? currentBook.book_name : "Select a book"}
            </span>
            <ChevronDown size={14} className="text-text-muted" />
          </button>

          {showBookPicker && (
            <div className="absolute top-full left-0 mt-1 w-80 bg-bg-card border border-bg-border rounded-xl shadow-2xl overflow-hidden animate-slide-up">
              <div className="px-3 py-2 border-b border-bg-border">
                <p className="text-[11px] text-text-muted font-medium uppercase tracking-wider">Select a book to chat with</p>
              </div>
              {books.length === 0 ? (
                <div className="p-5 text-sm text-text-muted text-center">
                  No books yet. <Link href="/upload" className="text-accent hover:underline">Upload one →</Link>
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto">
                  {books.map((b) => (
                    <button
                      key={b.index_name}
                      onClick={() => { setSelectedBook(b.index_name); setShowBookPicker(false); setMessages([]); }}
                      className={clsx(
                        "w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-bg-hover transition-colors border-b border-bg-border last:border-0",
                        selectedBook === b.index_name && "bg-accent/10"
                      )}
                    >
                      <BookOpen size={14} className="text-accent mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm text-text-primary font-medium">{b.book_name}</p>
                        <p className="text-xs text-text-muted mt-0.5">
                          Class {b.class} · {b.subject} · {b.total_pages}p · {b.total_chunks} chunks
                        </p>
                      </div>
                      {selectedBook === b.index_name && (
                        <span className="ml-auto text-accent text-lg">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Book meta */}
        {currentBook && (
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-xs text-text-muted">
              Class {currentBook.class} · {currentBook.subject}
            </span>
            <span className="w-1 h-1 rounded-full bg-text-muted" />
            <span className="text-xs text-text-muted">{currentBook.total_pages} pages</span>
            {currentBook.pages_with_images > 0 && (
              <>
                <span className="w-1 h-1 rounded-full bg-text-muted" />
                <span className="text-xs text-amber-500">{currentBook.pages_with_images} diagram pages</span>
              </>
            )}
          </div>
        )}

        {/* Hybrid badge */}
        <div className="hidden md:flex items-center gap-1.5 ml-auto bg-accent/5 border border-accent/20 rounded-full px-3 py-1">
          <Zap size={11} className="text-accent" />
          <span className="text-[11px] text-accent font-medium">Hybrid Search (Vector + BM25)</span>
        </div>

        {messages.length > 0 && (
          <button onClick={clearChat} className="flex items-center gap-1.5 text-xs text-text-muted hover:text-red-400 transition-colors md:ml-0 ml-auto">
            <Trash2 size={13} /> Clear
          </button>
        )}
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-5">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-5 px-4">
            <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center">
              <BookOpen size={28} className="text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                {selectedBook ? `Chatting with: ${currentBook?.book_name}` : "Select a book to begin"}
              </h2>
              <p className="text-sm text-text-muted mt-1 max-w-md">
                {selectedBook
                  ? "Ask any question. Answers come strictly from the book with page citations."
                  : "Use the dropdown above to pick a processed textbook."}
              </p>
            </div>
            {selectedBook && (
              <div className="flex flex-wrap gap-2 justify-center">
                {SAMPLE_QUESTIONS.map((q) => (
                  <button key={q} onClick={() => setInput(q)}
                    className="text-xs bg-bg-card border border-bg-border hover:border-accent/30 text-text-secondary rounded-full px-3 py-1.5 transition-colors hover:text-text-primary">
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={clsx("flex animate-fade-in", msg.role === "user" ? "justify-end" : "justify-start")}>
            <div className={clsx(
              "max-w-2xl rounded-2xl px-4 py-3",
              msg.role === "user"
                ? "bg-accent text-bg-primary text-sm font-medium"
                : "bg-bg-card border border-bg-border text-text-primary"
            )}>
              {msg.loading ? (
                <div className="flex items-center gap-1.5 py-1 px-1">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="text-xs text-text-muted ml-2">Searching in book...</span>
                </div>
              ) : msg.role === "assistant" ? (
                <>
                  <div className="prose-chat text-sm leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </div>
                  {msg.meta && (
                    <div className="mt-3 pt-2.5 border-t border-bg-border flex flex-wrap items-center gap-x-4 gap-y-1.5">
                      {msg.meta.source === "threshold_filter" ? (
                        <span className="flex items-center gap-1 text-[11px] text-amber-500">
                          <AlertCircle size={11} /> Out of scope · Score: {msg.meta.score.toFixed(3)}
                        </span>
                      ) : (
                        <>
                          <span className={clsx("flex items-center gap-1 text-[11px] font-medium", scoreColor(msg.meta.score))}>
                            <BarChart2 size={11} />
                            {scoreLabel(msg.meta.score)} confidence ({msg.meta.score.toFixed(3)})
                          </span>
                          <span className="text-[11px] text-text-muted">{msg.meta.chunks_used} chunks used</span>
                          {msg.meta.pages_referenced && msg.meta.pages_referenced.length > 0 && (
                            <span className="flex items-center gap-1 text-[11px] text-blue-400">
                              <FileText size={11} />
                              Pages: {msg.meta.pages_referenced.join(", ")}
                            </span>
                          )}
                          {msg.meta.from_cache && (
                            <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                              <Zap size={11} /> Cached
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm">{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* ── Input Bar ── */}
      <div className="px-4 py-4 border-t border-bg-border bg-bg-secondary shrink-0">
        <div className="flex items-end gap-2 max-w-4xl mx-auto">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            placeholder={selectedBook ? "Ask a question from the book..." : "Select a book first..."}
            disabled={!selectedBook || sending}
            rows={1}
            className="flex-1 bg-bg-card border border-bg-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 resize-none disabled:opacity-50 transition-colors"
            style={{ maxHeight: "140px", overflowY: "auto" }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || !selectedBook || sending}
            className="w-10 h-10 rounded-xl bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors shrink-0"
          >
            <Send size={16} className="text-bg-primary" />
          </button>
        </div>
        <p className="text-[11px] text-text-muted text-center mt-2">
          Enter to send · Shift+Enter for new line · Hybrid search · Page citations · Answers from book only
        </p>
      </div>

      {/* Backdrop — z-50, below book picker wrapper (z-[60]) */}
      {showBookPicker && (
        <div className="fixed inset-0 z-50" onClick={() => setShowBookPicker(false)} />
      )}
    </div>
  );
}

export default function ChatPage() {
  return <Suspense><ChatContent /></Suspense>;
}
