// app/layout.tsx — Root layout with sidebar navigation

import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { Toaster } from "react-hot-toast";

export const metadata: Metadata = {
  title: "EduRAG — Class 1–12 Book Assistant",
  description: "Ask questions from your NCERT textbooks. Answers come strictly from the book.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex h-screen overflow-hidden bg-bg-primary text-text-primary">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#16161f",
              color: "#f4f4f8",
              border: "1px solid #1e1e2e",
              borderRadius: "10px",
            },
          }}
        />
      </body>
    </html>
  );
}
