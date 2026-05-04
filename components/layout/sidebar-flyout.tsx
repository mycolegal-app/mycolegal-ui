"use client";

import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

interface SidebarFlyoutProps {
  /** Trigger button content (icon + label + chevron) — rendered in the sidebar column. */
  trigger: ReactNode;
  /** Highlight the trigger when its panel matches the current route. */
  active?: boolean;
  /** Panel content — rendered in a portal as a fixed-position flyout. */
  children: ReactNode;
  /** Visible width of the parent sidebar in px (used to anchor the flyout to its right edge). */
  sidebarWidth?: number;
  /** Optional aria-label for the trigger. */
  ariaLabel?: string;
}

/**
 * Sidebar collapsible block that opens as a flyout panel to the right of the
 * sidebar, instead of expanding inline. Avoids forcing the sidebar to scroll.
 *
 * Click outside, Escape, or click on a child item closes the panel. The panel
 * is rendered via a portal to escape the sidebar's `overflow-y-auto` container.
 */
export function SidebarFlyout({
  trigger,
  active = false,
  children,
  sidebarWidth = 220,
  ariaLabel,
}: SidebarFlyoutProps) {
  const [open, setOpen] = useState(false);
  const [top, setTop] = useState(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    function reposition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) setTop(rect.top);
    }
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={ariaLabel}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          active || open
            ? "bg-white/10 text-white"
            : "text-gray-400 hover:bg-white/5 hover:text-white"
        }`}
      >
        {trigger}
      </button>
      {open && typeof document !== "undefined" &&
        createPortal(
          <FlyoutPanel
            ref={panelRef}
            top={top}
            sidebarWidth={sidebarWidth}
            onAutoClose={() => setOpen(false)}
          >
            {children}
          </FlyoutPanel>,
          document.body,
        )}
    </>
  );
}

interface FlyoutPanelProps {
  top: number;
  sidebarWidth: number;
  onAutoClose: () => void;
  children: ReactNode;
}

const FlyoutPanel = forwardRef<HTMLDivElement, FlyoutPanelProps>(function FlyoutPanel(
  { top, sidebarWidth, onAutoClose, children },
  ref,
) {
  return (
    <div
      ref={ref}
      role="menu"
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("a, button")) onAutoClose();
      }}
      style={{ top: Math.max(8, top), left: sidebarWidth + 6 }}
      className="fixed z-[60] min-w-[220px] max-w-[280px] rounded-lg border border-white/10 bg-[#0f1b2d] p-1.5 shadow-2xl"
    >
      {children}
    </div>
  );
});
