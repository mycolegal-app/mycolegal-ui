"use client";

import { useEffect } from "react";
import { useHelp } from "./help-context";
import { useI18n } from "../i18n/i18n-context";
import { HelpTooltip } from "./help-tooltip";

interface HelpOverlayProps {
  /** Called when user clicks "Más info →" on a tooltip */
  onNavigateToManual?: (path: string) => void;
}

/**
 * Renders the help overlay with backdrop and tooltips.
 * Place this once in the app layout (e.g. inside AppShell).
 */
export function HelpOverlay({ onNavigateToManual }: HelpOverlayProps) {
  const { active, toggle, annotations } = useHelp();
  const { t } = useI18n();

  // Close on Escape key
  useEffect(() => {
    if (!active) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") toggle();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [active, toggle]);

  if (!active) return null;

  return (
    <>
      {/* Semi-transparent backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 cursor-pointer"
        onClick={toggle}
        aria-label={t("common.close")}
      />

      {/* Tooltips */}
      {annotations.map((annotation, i) => (
        <HelpTooltip
          key={`${annotation.target}-${i}`}
          annotation={annotation}
          onManualClick={onNavigateToManual}
          moreInfoLabel={t("help.moreInfo")}
        />
      ))}

      {/* Help mode indicator */}
      <div className="fixed bottom-6 right-6 z-[60] flex items-center gap-2 rounded-full bg-cyan-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
        <span>{t("help.modeActive")}</span>
        <button
          onClick={toggle}
          className="ml-1 rounded-full bg-white/20 px-2 py-0.5 text-xs hover:bg-white/30"
        >
          {t("help.escToClose")}
        </button>
      </div>
    </>
  );
}
