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
import { useSidebarCollapse } from "./sidebar-collapse-context";

interface SidebarFlyoutProps {
  /** Trigger button content (icon + label + chevron) — rendered in the sidebar column. */
  trigger: ReactNode;
  /** Icono-only del trigger, usado en modo compacto en lugar de `trigger`
   *  (que incluye texto que no cabe en la columna estrecha). Si no se pasa,
   *  en compacto se renderiza `trigger` centrado y recortado. */
  icon?: ReactNode;
  /** Highlight the trigger when its panel matches the current route. */
  active?: boolean;
  /** Panel content — rendered in a portal as a fixed-position flyout. */
  children: ReactNode;
  /** Visible width of the parent sidebar in px (used to anchor the flyout to its right edge). */
  sidebarWidth?: number;
  /** Optional aria-label for the trigger. */
  ariaLabel?: string;
  /** Controlled open state. If provided, `onOpenChange` should also be set. */
  open?: boolean;
  /** Controlled open-change callback. Required when `open` is provided. */
  onOpenChange?: (open: boolean) => void;
}

/**
 * Sidebar collapsible block that opens as a flyout panel to the right of the
 * sidebar, instead of expanding inline. The panel is positioned so it fits
 * entirely in the viewport — sliding upward when needed — instead of scrolling.
 *
 * Click outside, Escape, or click on a child item closes the panel. The panel
 * is rendered via a portal to escape the sidebar's `overflow-y-auto` container.
 */
export function SidebarFlyout({
  trigger,
  icon,
  active = false,
  children,
  sidebarWidth = 220,
  ariaLabel,
  open: openProp,
  onOpenChange,
}: SidebarFlyoutProps) {
  const { collapsed, width: collapseWidth } = useSidebarCollapse();
  // En compacto el panel se ancla al ancho real del sidebar (64px), no al
  // valor por defecto de 220 que pasan los consumidores.
  const effectiveWidth = collapsed ? collapseWidth : sidebarWidth;
  const isControlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? !!openProp : internalOpen;
  const setOpen = (next: boolean) => {
    if (isControlled) onOpenChange?.(next);
    else setInternalOpen(next);
  };

  const [top, setTop] = useState(0);
  const [maxHeight, setMaxHeight] = useState<number | null>(null);
  const [positioned, setPositioned] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPositioned(false);
      return;
    }
    function reposition() {
      const triggerEl = triggerRef.current;
      const panel = panelRef.current;
      if (!triggerEl || !panel) return;
      const rect = triggerEl.getBoundingClientRect();
      const vh = window.innerHeight;
      const margin = 8;
      // Medimos altura natural del contenido. scrollHeight ignora cualquier
      // max-height aplicada previamente, así que es estable entre repos.
      const naturalHeight = panel.scrollHeight;
      const maxAllowed = vh - 2 * margin;
      const finalHeight = Math.min(naturalHeight, maxAllowed);
      // Por defecto alineamos con el trigger. Si así nos saldríamos por abajo,
      // desplazamos el panel hacia arriba lo suficiente para que quepa entero.
      let nextTop = rect.top;
      if (nextTop + finalHeight > vh - margin) {
        nextTop = vh - margin - finalHeight;
      }
      nextTop = Math.max(margin, nextTop);
      setTop(nextTop);
      // Solo restringimos altura (y por tanto activamos scroll) si el
      // contenido no cabe ni siquiera en el viewport entero.
      setMaxHeight(naturalHeight > maxAllowed ? maxAllowed : null);
      setPositioned(true);
    }
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, children]);

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
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={ariaLabel}
        title={collapsed ? ariaLabel : undefined}
        className={`flex w-full items-center gap-3 overflow-hidden rounded-lg py-2 text-sm font-medium transition-colors ${
          collapsed ? "justify-center px-0" : "px-3"
        } ${
          active || open
            ? "bg-white/10 text-white"
            : "text-gray-400 hover:bg-white/5 hover:text-white"
        }`}
      >
        {collapsed ? (icon ?? trigger) : trigger}
      </button>
      {open && typeof document !== "undefined" &&
        createPortal(
          <FlyoutPanel
            ref={panelRef}
            top={top}
            sidebarWidth={effectiveWidth}
            maxHeight={maxHeight}
            positioned={positioned}
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
  maxHeight: number | null;
  positioned: boolean;
  onAutoClose: () => void;
  children: ReactNode;
}

const FlyoutPanel = forwardRef<HTMLDivElement, FlyoutPanelProps>(function FlyoutPanel(
  { top, sidebarWidth, maxHeight, positioned, onAutoClose, children },
  ref,
) {
  // Mientras no esté posicionado (primer paint tras abrir), renderizamos
  // invisible para medir scrollHeight sin flash en la esquina superior.
  return (
    <div
      ref={ref}
      role="menu"
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("a, button")) onAutoClose();
      }}
      style={{
        top: Math.max(8, top),
        left: sidebarWidth + 6,
        maxHeight: maxHeight ? `${maxHeight}px` : undefined,
        visibility: positioned ? "visible" : "hidden",
      }}
      className={`fixed z-[60] flex min-w-[220px] max-w-[280px] flex-col rounded-lg border border-white/10 bg-[#0f1b2d] p-1.5 shadow-2xl ${
        maxHeight ? "overflow-y-auto" : "overflow-y-visible"
      }`}
    >
      {children}
    </div>
  );
});
