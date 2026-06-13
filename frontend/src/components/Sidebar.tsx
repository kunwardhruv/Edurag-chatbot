"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Upload, History, LayoutDashboard, GraduationCap } from "lucide-react";
import clsx from "clsx";

const NAV_ITEMS = [
  { href: "/",        icon: LayoutDashboard, label: "Dashboard"  },
  { href: "/upload",  icon: Upload,          label: "Upload Book" },
  { href: "/chat",    icon: BookOpen,        label: "Chat"        },
  { href: "/history", icon: History,         label: "History"     },
];

export default function Sidebar() {
  const path = usePathname();

  return (
    <aside className="w-16 md:w-56 flex flex-col bg-bg-secondary border-r border-bg-border shrink-0 h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-bg-border">
        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
          <GraduationCap size={18} className="text-bg-primary" />
        </div>
        <span className="hidden md:block font-semibold text-base text-text-primary tracking-tight">
          Edu<span className="text-accent">RAG</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 space-y-1">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = path === href || (href !== "/" && path.startsWith(href));
          return (
            <Link key={href} href={href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group",
                active ? "bg-accent/10 text-accent" : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              )}>
              <Icon size={18} className={clsx("shrink-0", active ? "text-accent" : "text-text-muted group-hover:text-text-secondary")} />
              <span className="hidden md:block text-sm font-medium">{label}</span>
              {active && <span className="hidden md:block ml-auto w-1.5 h-1.5 rounded-full bg-accent" />}
            </Link>
          );
        })}
      </nav>

      {/* Bottom note */}
      <div className="hidden md:block px-4 py-4 border-t border-bg-border">
        <p className="text-[11px] text-text-muted leading-snug">
          Answers from uploaded book only
        </p>
      </div>
    </aside>
  );
}
