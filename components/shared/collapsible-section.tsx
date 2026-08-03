"use client";

import { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";

interface CollapsibleSectionProps {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  defaultOpen?: boolean;
  storageKey?: string;
  /**
   * Acción opcional alineada a la derecha de la cabecera (p.ej. un botón
   * "Editar"), a la izquierda del chevron. Se renderiza FUERA del botón que
   * pliega/despliega para no anidar botones, así que sus propios clics no
   * abren/cierran la sección. Cuando se omite, la cabecera es idéntica a la de
   * siempre (título + chevron), por lo que es retrocompatible.
   */
  headerAction?: React.ReactNode;
}

export function CollapsibleSection({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
  storageKey,
  headerAction,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!storageKey) return;
    const stored = localStorage.getItem(`collapsible:${storageKey}`);
    if (stored !== null) setOpen(stored === "true");
  }, [storageKey]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (storageKey) {
      localStorage.setItem(`collapsible:${storageKey}`, String(next));
    }
  }

  return (
    <div className="rounded-lg border bg-white">
      <div className="flex w-full items-center gap-2 px-5 py-3">
        <button
          onClick={toggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {Icon && <Icon className="h-4 w-4 shrink-0 text-gray-500" />}
          <h3 className="truncate text-sm font-semibold text-gray-700">{title}</h3>
        </button>
        {headerAction && <div className="flex shrink-0 items-center">{headerAction}</div>}
        <button
          onClick={toggle}
          aria-label={open ? "Contraer" : "Expandir"}
          className="shrink-0"
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 text-gray-400 transition-transform",
              open && "rotate-180"
            )}
          />
        </button>
      </div>
      {open && <div className="border-t px-5 py-4">{children}</div>}
    </div>
  );
}
