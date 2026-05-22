"use client";

/**
 * Persistent top bar shown on every page while the current session is an
 * impersonation session (JWT carries `impersonatedBy`). Makes the "acting as"
 * state impossible to miss and offers a one-click exit that revokes the
 * impersonation token and restores the actor's own session.
 *
 * Rendered by the shared AppShell when `/api/auth/me` reports `impersonatedBy`.
 */

import { useState } from "react";
import { UserCog } from "lucide-react";
import { useI18n } from "../i18n/i18n-context";

interface ImpersonationBannerProps {
  /** Label of the user being impersonated (display name or email). */
  targetLabel: string;
  /** Fallback exit target when no `mc-imp-return` cookie is present. Defaults to "/". */
  redirectAfterStop?: string;
}

/**
 * The admin (superadmin) flow leaves a readable `mc-imp-return` cookie with the
 * URL to return to on exit, because the superadmin's own session lives in a
 * cookie the user-facing apps can't read. The org_admin flow has no such cookie
 * and just reloads the current app.
 */
function readReturnUrl(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)mc-imp-return=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function ImpersonationBanner({ targetLabel, redirectAfterStop }: ImpersonationBannerProps) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  async function stop() {
    setBusy(true);
    const returnUrl = readReturnUrl();
    try {
      await fetch("/api/auth/impersonate/stop", { method: "POST", keepalive: true });
    } catch {
      // ignore — navigate anyway; the actor session is restored server-side
    }
    window.location.href = returnUrl || redirectAfterStop || "/";
  }

  return (
    <div
      role="alert"
      className="flex shrink-0 items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950 print:hidden"
    >
      <UserCog className="h-4 w-4 shrink-0" />
      <span className="truncate">{t("ui.impersonation.bannerActingAs", { user: targetLabel })}</span>
      <button
        type="button"
        onClick={stop}
        disabled={busy}
        className="shrink-0 rounded bg-amber-950/15 px-3 py-1 text-xs font-semibold transition-colors hover:bg-amber-950/25 disabled:opacity-50"
      >
        {busy ? t("ui.impersonation.bannerExiting") : t("ui.impersonation.bannerExit")}
      </button>
    </div>
  );
}
