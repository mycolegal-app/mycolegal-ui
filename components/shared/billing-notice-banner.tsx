"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useI18n } from "../i18n/i18n-context";

/**
 * Aviso post-login de una app CONCEDIDA cuya cortesía/trial ha expirado: la org
 * conserva el acceso (OrgApp activo) pero ya no tiene derecho de pago. Descartable
 * (no bloquea la navegación); el corte real del consumo de IA lo hace el monedero
 * (suelo 0 para no-entitled). El CTA de reactivar solo se muestra al org_admin.
 */
export interface BillingNotice {
  appSlug: string;
  appName: string;
  /** APP_COURTESY_EXPIRED | APP_TRIAL_EXPIRED | APP_SUBSCRIPTION_EXPIRED */
  code: string;
  canSubscribe: boolean;
}

const CODE_KEY: Record<string, string> = {
  APP_COURTESY_EXPIRED: "courtesyExpired",
  APP_TRIAL_EXPIRED: "trialExpired",
  APP_SUBSCRIPTION_EXPIRED: "subscriptionExpired",
};

export function BillingNoticeBanner({
  notices,
  subscribeUrl,
}: {
  notices: BillingNotice[];
  subscribeUrl?: string | null;
}) {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = notices.filter((n) => !dismissed.has(`${n.appSlug}:${n.code}`));
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 px-6 pt-3">
      {visible.map((n) => {
        const key = `${n.appSlug}:${n.code}`;
        const codeKey = CODE_KEY[n.code] ?? "subscriptionExpired";
        return (
          <div
            key={key}
            role="alert"
            className="flex items-center gap-3 rounded-lg border border-mc-warning-500/30 bg-mc-warning-50 px-4 py-3"
          >
            <AlertTriangle className="h-5 w-5 flex-shrink-0 text-mc-warning-500" />
            <p className="flex-1 text-sm text-mc-warning-700">
              {t(`ui.billingNotice.${codeKey}`, { app: n.appName })}{" "}
              {n.canSubscribe ? t("ui.billingNotice.subscribePrompt") : t("ui.billingNotice.askAdmin")}
            </p>
            {n.canSubscribe && subscribeUrl && (
              <a
                href={subscribeUrl}
                className="flex-shrink-0 rounded-lg bg-mc-warning-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
              >
                {t("ui.billingNotice.ctaSubscribe")}
              </a>
            )}
            <button
              type="button"
              onClick={() => setDismissed((s) => new Set(s).add(key))}
              aria-label={t("ui.billingNotice.dismiss")}
              className="flex-shrink-0 rounded-sm p-1 text-mc-warning-700 transition-opacity hover:opacity-70"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
