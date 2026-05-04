"use client";

import { useEffect } from "react";
import { useHelp } from "./help-context";
import { useI18n } from "../i18n/i18n-context";
import { HelpTooltip, HELP_REPOSITION_EVENT } from "./help-tooltip";

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

  // Avoid overlapping tooltips by translating later siblings downward.
  useEffect(() => {
    if (!active) return;

    let rafId = 0;
    function schedule() {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(avoidOverlaps);
    }

    function avoidOverlaps() {
      const tooltips = Array.from(
        document.querySelectorAll<HTMLElement>('[data-help-tooltip="true"]'),
      );
      // Reset previous shifts y top overrides para reposicionar desde cero.
      tooltips.forEach((el) => {
        el.style.translate = "";
        el.style.top = el.dataset.helpBaseTop || el.style.top;
      });

      // Obstáculos adicionales: los anchors `[data-help]` (cards/charts).
      // Evitamos que un tooltip los tape, no solo a otros tooltips.
      const anchorRects = Array.from(
        document.querySelectorAll<HTMLElement>("[data-help]"),
      ).map((el) => el.getBoundingClientRect());

      // Umbral: si un tooltip tendría que desplazarse más que esto hacia
      // abajo, flippeamos arriba del anchor en lugar de seguir empujando
      // sobre charts/contenido siguiente.
      const FLIP_THRESHOLD = 60;

      const placed: DOMRect[] = [];
      for (const el of tooltips) {
        let rect = el.getBoundingClientRect();
        let shift = 0;
        let safety = 0;
        while (safety++ < tooltips.length + 1) {
          const collision =
            placed.find((p) => rectsOverlap(rect, p)) ||
            anchorRects.find((a) => !rectsContains(a, rect) && rectsOverlap(rect, a));
          if (!collision) break;
          const needed = collision.bottom - rect.top + 4;
          shift += needed;
          rect = new DOMRect(rect.x, rect.y + needed, rect.width, rect.height);
        }

        // Si el shift acumulado tapa contenido siguiente, flippea arriba
        // del anchor (siempre que haya espacio) y reintenta el cálculo.
        if (shift > FLIP_THRESHOLD) {
          const anchorSel = el.dataset.helpAnchor;
          const anchor = anchorSel ? document.querySelector<HTMLElement>(anchorSel) : null;
          const anchorRect = anchor?.getBoundingClientRect();
          if (anchorRect && anchorRect.top - rect.height - 12 > 4) {
            const baseTop = parseFloat(el.dataset.helpBaseTop || el.style.top) || 0;
            const flippedTop = anchorRect.top - rect.height - 8;
            el.dataset.helpBaseTop = el.dataset.helpBaseTop || el.style.top;
            el.style.top = `${flippedTop}px`;
            el.style.translate = "";
            shift = 0;
            const flippedRect = new DOMRect(rect.x, flippedTop, rect.width, rect.height);
            placed.push(flippedRect);
            void baseTop;
            continue;
          }
        }
        if (shift > 0) {
          el.style.translate = `0 ${shift}px`;
        }
        placed.push(rect);
      }
    }

    schedule();
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    window.addEventListener(HELP_REPOSITION_EVENT, schedule);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener(HELP_REPOSITION_EVENT, schedule);
    };
  }, [active, annotations]);

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

function rectsOverlap(a: DOMRect, b: DOMRect): boolean {
  return (
    a.left < b.right &&
    a.right > b.left &&
    a.top < b.bottom &&
    a.bottom > b.top
  );
}

// Devuelve true cuando `outer` contiene a `inner` (anchor con su propio
// tooltip dentro: no es realmente colisión, es la flecha pegada al anchor).
function rectsContains(outer: DOMRect, inner: DOMRect): boolean {
  return (
    inner.left >= outer.left - 1 &&
    inner.right <= outer.right + 1 &&
    inner.top >= outer.top - 1 &&
    inner.bottom <= outer.bottom + 1
  );
}
