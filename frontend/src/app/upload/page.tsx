"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, BookOpen, Image } from "lucide-react";
import toast from "react-hot-toast";
import { processBook, fetchConfig } from "@/lib/api";
import clsx from "clsx";

const STEPS = [
  "Extracting text from PDF...",
  "Chunking text...",
  "Generating embeddings...",
  "Building FAISS index...",
  "Saving to disk...",
];

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [className, setClassName] = useState("6");
  const [subject, setSubject] = useState("Science");
  const [bookName, setBookName] = useState("");
  const [classes, setClasses] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [result, setResult] = useState<{ success: boolean; index_name: string; stats: Record<string, number> } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchConfig()
      .then((cfg) => {
        setClasses(cfg.classes);
        setSubjects(cfg.subjects);
      })
      .catch(() => {});
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === "application/pdf") setFile(dropped);
    else toast.error("Only PDF files are supported");
  }, []);

  const handleSubmit = async () => {
    if (!file || !bookName.trim()) return toast.error("Please fill all fields");

    setProcessing(true);
    setError("");
    setResult(null);

    let step = 0;
    const interval = setInterval(() => {
      step = Math.min(step + 1, STEPS.length - 1);
      setCurrentStep(step);
    }, 4000);

    try {
      const res = await processBook(file, className, subject, bookName.trim());
      clearInterval(interval);
      setCurrentStep(STEPS.length);
      setResult(res);
      toast.success("Book processed successfully!");
    } catch (err: any) {
      clearInterval(interval);
      setError(err.message || "Processing failed");
      toast.error(err.message || "Processing failed");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">Upload Book</h1>
        <p className="text-text-secondary mt-1 text-sm">
          Upload any class 1–12 PDF textbook. The system will process and index it for Q&amp;A.
        </p>
      </div>

      {/* Book Metadata */}
      <div className="bg-bg-card border border-bg-border rounded-xl p-5 mb-5">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-4">Book Details</h3>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs text-text-muted mb-1.5">Class</label>
            <select
              title="Select class"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              className="w-full bg-bg-secondary border border-bg-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent/50"
            >
              {classes.map((c) => <option key={c} value={c}>Class {c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1.5">Subject</label>
            <select
              title="Select subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-bg-secondary border border-bg-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent/50"
            >
              {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1.5">Book Name</label>
          <input
            type="text"
            value={bookName}
            onChange={(e) => setBookName(e.target.value)}
            placeholder="e.g. NCERT Science Part 1"
            className="w-full bg-bg-secondary border border-bg-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 transition-colors"
          />
        </div>
      </div>

      {/* Drop Zone */}
      <div
        onClick={() => !processing && fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={clsx(
          "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all mb-5",
          dragging ? "border-accent bg-accent/5" : "border-bg-border hover:border-accent/40 hover:bg-bg-hover",
          processing && "pointer-events-none opacity-50"
        )}
      >
        <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" title="Select PDF file"
          onChange={(e) => setFile(e.target.files?.[0] || null)} />
        {file ? (
          <div className="flex flex-col items-center gap-2">
            <FileText size={32} className="text-accent" />
            <p className="font-medium text-text-primary text-sm">{file.name}</p>
            <p className="text-xs text-text-muted">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload size={32} className="text-text-muted" />
            <p className="text-text-secondary text-sm font-medium">Drop PDF here or click to browse</p>
            <p className="text-xs text-text-muted">Text-based PDFs only (not scanned images)</p>
          </div>
        )}
      </div>

      {/* Diagram notice */}
      <div className="flex gap-2 items-start bg-amber-500/5 border border-amber-500/20 rounded-lg px-4 py-3 mb-5 text-xs text-amber-400">
        <Image size={14} className="shrink-0 mt-0.5" />
        <p><strong>Diagrams:</strong> Text labels &amp; captions near diagrams will be indexed. Pure rasterized image diagrams are not semantically searchable — only surrounding text will be.</p>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!file || !bookName.trim() || processing}
        className="w-full bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-bg-primary font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        {processing ? <Loader2 size={18} className="animate-spin" /> : <BookOpen size={18} />}
        {processing ? "Processing..." : "Process Book"}
      </button>

      {/* Processing Steps */}
      {processing && (
        <div className="mt-6 bg-bg-card border border-bg-border rounded-xl p-5 animate-slide-up">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Processing Progress</h3>
          <div className="space-y-3">
            {STEPS.map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                {i < currentStep ? (
                  <CheckCircle size={16} className="text-emerald-400 shrink-0" />
                ) : i === currentStep ? (
                  <Loader2 size={16} className="text-accent animate-spin shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-bg-border shrink-0" />
                )}
                <span className={clsx(
                  "text-sm",
                  i < currentStep ? "text-emerald-400" :
                  i === currentStep ? "text-accent" : "text-text-muted"
                )}>{step}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-text-muted mt-4">Large books (300+ pages) may take 2–4 minutes…</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="mt-6 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-5 animate-slide-up">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle size={18} className="text-emerald-400" />
            <h3 className="font-semibold text-emerald-400">Book processed successfully!</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              ["Pages", result.stats.total_pages],
              ["Chunks", result.stats.total_chunks],
              ["Diagram pages", result.stats.pages_with_images],
              ["Total images", result.stats.total_images],
            ].map(([label, val]) => (
              <div key={String(label)} className="bg-bg-secondary rounded-lg px-3 py-2">
                <p className="text-[11px] text-text-muted">{label}</p>
                <p className="font-semibold text-text-primary">{val}</p>
              </div>
            ))}
          </div>
          <button
            onClick={() => router.push(`/chat?book=${result.index_name}`)}
            className="mt-4 w-full bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 font-medium py-2.5 rounded-lg text-sm transition-colors"
          >
            Start Chatting →
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4 flex gap-2 items-start bg-red-500/5 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}