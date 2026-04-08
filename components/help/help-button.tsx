"use client";

import { useHelp } from "./help-context";
import { HelpCircle } from "lucide-react";

/**
 * Toggle button for help mode. Place in the app header/banner.
 */
export function HelpButton() {
  const { active, toggle } = useHelp();

  return (
    <button
      onClick={toggle}
      className={`inline-flex items-center justify-center rounded-full p-1.5 transition-colors ${
        active
          ? "bg-cyan-500 text-white"
          : "text-white/60 hover:bg-white/10 hover:text-white"
      }`}
      title={active ? "Desactivar ayuda" : "Activar ayuda"}
      aria-label={active ? "Desactivar ayuda" : "Activar ayuda"}
    >
      <HelpCircle className="h-5 w-5" />
    </button>
  );
}
