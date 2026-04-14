"use client";

import { useState, useRef, useEffect } from "react";
import { LayoutGrid } from "lucide-react";

export interface AppInfo {
  slug: string;
  name: string;
  appUrl: string;
}

interface AppSwitcherProps {
  apps: AppInfo[];
  currentSlug?: string;
}

export function AppSwitcher({ apps, currentSlug }: AppSwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const otherApps = apps.filter((a) => a.slug !== currentSlug);
  if (otherApps.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-8 w-8 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white transition-colors"
        title="Cambiar aplicación"
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 min-w-[200px] rounded-lg border border-white/10 bg-navy-800 p-2 shadow-xl">
          <p className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-white/40">
            Aplicaciones
          </p>
          {otherApps.map((app) => (
            <a
              key={app.slug}
              href={app.appUrl}
              className="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-white/10 text-[10px] font-bold uppercase text-white/70">
                {app.name.slice(0, 2)}
              </div>
              <span className="font-medium">{app.name}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
