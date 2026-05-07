"use client";

import { useState } from "react";
import { ChevronRight, LayoutGrid, Loader2 } from "lucide-react";
import type { AppInfo } from "./app-switcher";
import { SidebarFlyout } from "./sidebar-flyout";
import { useI18n } from "../i18n/i18n-context";

interface MyAppsSectionProps {
  apps: AppInfo[];
  /** Slug of the currently active app — filtered out of the list. */
  currentSlug?: string;
  /** Optional override for the section label. */
  label?: string;
}

/**
 * "Mis aplicaciones" sidebar block. Opens as a flyout panel to the right of
 * the sidebar (no inline expansion), avoiding sidebar scroll. Selecting an app
 * shows a full-screen overlay (spinner + click capture) while the browser
 * navigates to the target app.
 */
export function MyAppsSection({ apps, currentSlug, label }: MyAppsSectionProps) {
  const { t } = useI18n();
  const resolvedLabel = label ?? t("ui.myApps.label");
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
      <SidebarFlyout
        ariaLabel={resolvedLabel}
        trigger={
          <>
            <LayoutGrid className="h-4 w-4 shrink-0" />
            {resolvedLabel}
            <ChevronRight className="ml-auto h-4 w-4" />
          </>
        }
      >
        <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
          {resolvedLabel}
        </p>
        {otherApps.map((app) => {
          const isNavigating = navigatingTo === app.slug;
          return (
            <button
              key={app.slug}
              type="button"
              onClick={() => navigate(app)}
              disabled={!!navigatingTo}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <AppLogo app={app} />
              <span className="truncate text-left">{app.name}</span>
              {isNavigating && (
                <Loader2 className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin text-cyan-400" />
              )}
            </button>
          );
        })}
      </SidebarFlyout>
      {navigatingTo && <AppNavigatingOverlay />}
    </>
  );
}

function AppLogo({ app }: { app: AppInfo }) {
  const initials = app.name.slice(0, 2).toUpperCase();
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded bg-white/10 text-[10px] font-bold uppercase text-white/70">
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
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-3 rounded-lg bg-white px-6 py-5 shadow-xl">
        <Loader2 className="h-7 w-7 animate-spin text-cyan-600" />
        <p className="text-sm font-medium text-gray-700">{t("ui.myApps.loadingApp")}</p>
      </div>
    </div>
  );
}
