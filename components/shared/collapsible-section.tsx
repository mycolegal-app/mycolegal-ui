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
}

export function CollapsibleSection({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
  storageKey,
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
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-gray-500" />}
          <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-gray-400 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && <div className="border-t px-5 py-4">{children}</div>}
    </div>
  );
}
