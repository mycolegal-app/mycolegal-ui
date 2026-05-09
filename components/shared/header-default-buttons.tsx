"use client";

import { HelpCircle, Search } from "lucide-react";
import { NavLink as Link } from "./nav-link";
import { useI18n } from "../i18n/i18n-context";

const BTN_BASE =
  "flex h-8 w-8 items-center justify-center rounded text-white/70 hover:text-white hover:bg-white/10";
const BTN_DISABLED =
  "flex h-8 w-8 items-center justify-center rounded text-white/30 cursor-not-allowed";

export function DefaultHelpButton({ manualHref = "/manual" }: { manualHref?: string }) {
  const { t } = useI18n();
  return (
    <Link
      href={manualHref}
      aria-label={t("ui.header.helpAria")}
      title={t("ui.header.helpTitle")}
      className={BTN_BASE}
    >
      <HelpCircle className="h-4 w-4" />
    </Link>
  );
}

export function DefaultSearchButton() {
  const { t } = useI18n();
  return (
    <button
      type="button"
      disabled
      aria-label={t("ui.header.searchAria")}
      title={t("ui.header.searchUnavailable")}
      className={BTN_DISABLED}
    >
      <Search className="h-4 w-4" />
    </button>
  );
}
