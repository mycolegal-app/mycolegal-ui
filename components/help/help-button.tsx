"use client";

import { useHelp } from "./help-context";
import { useI18n } from "../i18n/i18n-context";
import { HelpCircle } from "lucide-react";

/**
 * Toggle button for help mode. Place in the app header/banner.
 */
export function HelpButton() {
  const { active, toggle } = useHelp();
  const { t } = useI18n();

  return (
    <button
      onClick={toggle}
      className={`inline-flex items-center justify-center rounded-full p-1.5 transition-colors ${
        active
          ? "bg-cyan-500 text-white"
          : "text-white/60 hover:bg-white/10 hover:text-white"
      }`}
      title={active ? t("help.deactivate") : t("help.activate")}
      aria-label={active ? t("help.deactivate") : t("help.activate")}
    >
      <HelpCircle className="h-5 w-5" />
    </button>
  );
}
