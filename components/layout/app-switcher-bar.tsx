"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import type { AppInfo } from "./app-info";
import { useI18n } from "../i18n/i18n-context";
import { cn } from "../../lib/utils";

interface AppSwitcherBarProps {
  apps: AppInfo[];
  /** Slug of the current app — highlighted, not navigated to on click. */
  currentSlug: string;
}

const STORAGE_KEY = "mc:app-switcher:open";

/**
 * Subheader debajo del header estándar. Lista las apps habilitadas del usuario
 * como icono + nombre y permite saltar a cualquiera con un solo clic.
 *
 * Dos estados:
 *  - Expandido: fila de iconos+nombre sobre fondo claro.
 *  - Colapsado: cinta fina gris con un único chevron a la derecha; toda la
 *    cinta es clickable. No muestra ningún literal.
 *
 * El estado se persiste por usuario+dispositivo en localStorage.
 */
export function AppSwitcherBar({ apps, currentSlug }: AppSwitcherBarProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(true);
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === "0") setExpanded(false);
      else if (raw === "1") setExpanded(true);
    } catch {
      /* localStorage bloqueado (modo privado, etc.) — usamos el default */
    }
  }, []);

  function toggle() {
    setExpanded((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function navigate(app: AppInfo) {
    if (navigatingTo) return;
    if (app.slug === currentSlug) return;
    setNavigatingTo(app.slug);
    window.location.href = app.appUrl;
  }

  if (apps.length === 0) return null;

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={t("ui.appSwitcher.expand")}
        title={t("ui.appSwitcher.expand")}
        className="flex h-[18px] w-full shrink-0 items-center justify-end border-b border-slate-300/60 bg-slate-300 px-6 transition-colors hover:bg-slate-400/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
      >
        <ChevronDown className="h-3.5 w-3.5 text-slate-700" />
      </button>
    );
  }

  return (
    <>
      <div
        role="navigation"
        aria-label={t("ui.appSwitcher.ariaLabel")}
        className="relative flex shrink-0 items-stretch border-b border-slate-200 bg-white"
      >
        <div className="flex flex-1 items-stretch gap-1 overflow-x-auto px-6 py-2">
          {apps.map((app) => {
            const isActive = app.slug === currentSlug;
            const isNavigating = navigatingTo === app.slug;
            return (
              <button
                key={app.slug}
                type="button"
                onClick={() => navigate(app)}
                disabled={!!navigatingTo || isActive}
                title={app.name}
                className={cn(
                  "group flex w-[88px] shrink-0 flex-col items-center gap-1 rounded-md px-2 py-1.5 transition-colors",
                  isActive
                    ? "cursor-default"
                    : "hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                <AppLogo app={app} active={isActive} />
                <span
                  className={cn(
                    "max-w-full truncate text-[11px] font-medium leading-tight",
                    isActive
                      ? "text-mc-primary-700"
                      : "text-slate-600 group-hover:text-slate-900",
                  )}
                >
                  {app.name}
                </span>
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="-mt-0.5 h-[2px] w-6 rounded-full bg-mc-primary-500"
                  />
                )}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-label={t("ui.appSwitcher.collapse")}
          title={t("ui.appSwitcher.collapse")}
          className="flex w-10 shrink-0 items-center justify-center border-l border-slate-200 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      </div>
      {navigatingTo && <AppNavigatingOverlay />}
    </>
  );
}

function AppLogo({ app, active }: { app: AppInfo; active: boolean }) {
  const initials = app.name.slice(0, 2).toUpperCase();
  return (
    <div
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded text-[10px] font-bold uppercase transition-colors",
        active
          ? "bg-mc-primary-500/15 text-mc-primary-700"
          : "bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-700",
      )}
    >
      {app.logoSvg ? (
        <div
          className="h-5 w-5 [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: app.logoSvg }}
        />
      ) : (
        initials
      )}
    </div>
  );
}

function AppNavigatingOverlay() {
  const { t } = useI18n();
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-3 rounded-lg bg-white px-6 py-5 shadow-xl">
        <Loader2 className="h-7 w-7 animate-spin text-cyan-600" />
        <p className="text-sm font-medium text-gray-700">
          {t("ui.appSwitcher.loadingApp")}
        </p>
      </div>
    </div>,
    document.body,
  );
}
