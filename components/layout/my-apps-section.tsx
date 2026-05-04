"use client";

import { useState } from "react";
import { ChevronDown, LayoutGrid, Loader2 } from "lucide-react";
import type { AppInfo } from "./app-switcher";

interface MyAppsSectionProps {
  apps: AppInfo[];
  /** Slug of the currently active app — filtered out of the list. */
  currentSlug?: string;
  /** Optional override for the section label. */
  label?: string;
}

/**
 * Collapsible "Mis aplicaciones" sidebar block. Default collapsed.
 * Selecting an app shows a full-screen overlay (spinner + click capture)
 * while the browser navigates to the target app.
 */
export function MyAppsSection({ apps, currentSlug, label = "Mis aplicaciones" }: MyAppsSectionProps) {
  const [open, setOpen] = useState(false);
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);

  const otherApps = apps.filter((a) => a.slug !== currentSlug);
  if (otherApps.length === 0) return null;

  function navigate(app: AppInfo) {
    if (navigatingTo) return;
    setNavigatingTo(app.slug);
    window.location.href = app.appUrl;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
      >
        <LayoutGrid className="h-4 w-4 shrink-0" />
        {label}
        <ChevronDown
          className={`ml-auto h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="ml-4 space-y-0.5">
          {otherApps.map((app) => {
            const isNavigating = navigatingTo === app.slug;
            return (
              <button
                key={app.slug}
                type="button"
                onClick={() => navigate(app)}
                disabled={!!navigatingTo}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <AppLogo app={app} />
                <span className="truncate text-left">{app.name}</span>
                {isNavigating && (
                  <Loader2 className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin text-cyan-400" />
                )}
              </button>
            );
          })}
        </div>
      )}
      {navigatingTo && <AppNavigatingOverlay />}
    </>
  );
}

function AppLogo({ app }: { app: AppInfo }) {
  const [errored, setErrored] = useState(false);
  const initials = app.name.slice(0, 2).toUpperCase();
  const showImg = app.logoUrl && !errored;
  return (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded bg-white/10 text-[10px] font-bold uppercase text-white/70">
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={app.logoUrl as string}
          alt=""
          className="h-full w-full object-contain"
          onError={() => setErrored(true)}
        />
      ) : (
        initials
      )}
    </div>
  );
}

function AppNavigatingOverlay() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-3 rounded-lg bg-white px-6 py-5 shadow-xl">
        <Loader2 className="h-7 w-7 animate-spin text-cyan-600" />
        <p className="text-sm font-medium text-gray-700">Cargando aplicación…</p>
      </div>
    </div>
  );
}
