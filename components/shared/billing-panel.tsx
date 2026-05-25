"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CreditCard, ExternalLink, Gift, Loader2 } from "lucide-react";
import { useI18n } from "../i18n/i18n-context";
import { apiErrorMessage } from "../../lib/api-error";
import { useIsOrgAdmin } from "../../hooks/use-is-org-admin";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/utils";

/**
 * Panel de suscripciones (self-service para el administrador de la org). Se monta
 * dentro de cada app y muestra el catálogo completo: la app actual (resaltada) y
 * cualquier otra, con su estado, uso del ciclo y acciones (suscribir / gestionar
 * en el portal de Stripe). Habla con `/api/billing/*` (proxy a platform).
 *
 * Las exenciones de cortesía NO se editan aquí: las aplica el superadmin desde
 * el panel admin. Aquí solo se muestran como estado.
 */

interface BillingItem {
  app: string;
  name: string;
  currency: string;
  baseAmount: number;
  includedUnits: number;
  overageUnitAmount: number;
  unitLabel: string;
  entitled: boolean;
  status: string | null;
  courtesy: boolean;
  courtesyUntil: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  hasSubscription: boolean;
  usage: { used: number; included: number; overage: number };
}

export interface BillingPanelProps {
  /** appSlug de la app desde la que se abre el panel (se resalta). */
  currentApp: string;
}

type BadgeVariant = "success" | "info" | "warning" | "secondary" | "premium";

export function BillingPanel({ currentApp }: BillingPanelProps) {
  const { t, language } = useI18n();
  const isAdmin = useIsOrgAdmin();
  const [items, setItems] = useState<BillingItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const locale = language === "CAT" || language === "VAL" ? "ca-ES" : language === "GAL" ? "gl-ES" : language === "EUS" ? "eu-ES" : "es-ES";

  const money = useCallback(
    (cents: number, currency: string) =>
      new Intl.NumberFormat(locale, { style: "currency", currency: currency.toUpperCase() }).format(cents / 100),
    [locale],
  );
  const date = useCallback(
    (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale) : ""),
    [locale],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/billing/overview");
      if (res.status === 401 || res.status === 403) {
        setError(t("ui.billing.adminOnly"));
        setItems([]);
        return;
      }
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(apiErrorMessage(t, { status: res.status, code: json?.error?.code, message: json?.error?.message }, t("ui.billing.loadError")));
        setItems([]);
        return;
      }
      const json = await res.json();
      setItems((json?.data ?? []) as BillingItem[]);
    } catch {
      setError(t("ui.billing.loadError"));
      setItems([]);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const action = useCallback(async (app: string, op: "checkout" | "portal") => {
    setBusy(app);
    try {
      const here = window.location.href;
      const body = op === "checkout"
        ? { app, successUrl: here, cancelUrl: here }
        : { app, returnUrl: here };
      const res = await fetch(`/api/billing/${op}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(apiErrorMessage(t, { status: res.status, code: json?.error?.code, message: json?.error?.message }, t("ui.billing.actionError")));
        return;
      }
      // checkout de una org ya activa → caemos al portal de gestión.
      if (op === "checkout" && json?.alreadyActive) {
        return action(app, "portal");
      }
      if (json?.url) {
        window.location.href = json.url as string;
        return;
      }
      setError(t("ui.billing.actionError"));
    } catch {
      setError(t("ui.billing.actionError"));
    } finally {
      setBusy(null);
    }
  }, [t]);

  const ordered = useMemo(() => {
    if (!items) return [];
    return [...items].sort((a, b) => (a.app === currentApp ? -1 : b.app === currentApp ? 1 : a.name.localeCompare(b.name)));
  }, [items, currentApp]);

  function statusBadge(it: BillingItem): { variant: BadgeVariant; label: string } {
    const courtesyActive = it.courtesy && (!it.courtesyUntil || new Date(it.courtesyUntil).getTime() > Date.now());
    if (courtesyActive) {
      return {
        variant: "premium",
        label: it.courtesyUntil ? t("ui.billing.courtesyUntil", { date: date(it.courtesyUntil) }) : t("ui.billing.courtesy"),
      };
    }
    switch (it.status) {
      case "active": return { variant: "success", label: t("ui.billing.status.active") };
      case "trialing": return { variant: "info", label: t("ui.billing.status.trialing") };
      case "past_due": return { variant: "warning", label: t("ui.billing.status.pastDue") };
      default: return { variant: "secondary", label: t("ui.billing.status.none") };
    }
  }

  if (items === null) {
    return (
      <div className="flex items-center justify-center py-12 text-mc-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!isAdmin && error) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-mc-warning-200 bg-mc-warning-50 p-4 text-sm text-mc-warning-800">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>{t("ui.billing.adminOnly")}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-mc-error-200 bg-mc-error-50 p-3 text-sm text-mc-error-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {ordered.map((it) => {
        const badge = statusBadge(it);
        const pct = it.usage.included > 0 ? Math.min(100, Math.round((it.usage.used / it.usage.included) * 100)) : 0;
        return (
          <Card key={it.app} className={cn(it.app === currentApp && "border-mc-primary-300 ring-1 ring-mc-primary-200")}>
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  {it.name}
                  {it.app === currentApp && <Badge variant="outline">{t("ui.billing.currentApp")}</Badge>}
                </CardTitle>
                <CardDescription>
                  {t("ui.billing.perMonth", { amount: money(it.baseAmount, it.currency) })}
                  {" · "}
                  {t("ui.billing.includedUnits", { n: String(it.includedUnits), unit: it.unitLabel })}
                  {it.overageUnitAmount > 0 && (
                    <>
                      {" · "}
                      {t("ui.billing.overagePrice", { amount: money(it.overageUnitAmount, it.currency), unit: it.unitLabel })}
                    </>
                  )}
                </CardDescription>
              </div>
              <Badge variant={badge.variant}>{badge.label}</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm text-mc-slate-600">
                  <span>{t("ui.billing.usage", { used: String(it.usage.used), included: String(it.usage.included), unit: it.unitLabel })}</span>
                  {it.usage.overage > 0 && (
                    <span className="text-mc-warning-700">{t("ui.billing.overageThisCycle", { n: String(it.usage.overage) })}</span>
                  )}
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-mc-neutral-100">
                  <div
                    className={cn("h-full rounded-full", it.usage.overage > 0 ? "bg-mc-warning-500" : "bg-mc-primary-500")}
                    style={{ width: `${it.usage.overage > 0 ? 100 : pct}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-mc-slate-500">
                  {it.cancelAtPeriodEnd && it.currentPeriodEnd
                    ? t("ui.billing.cancelsOn", { date: date(it.currentPeriodEnd) })
                    : it.status === "active" && it.currentPeriodEnd
                      ? t("ui.billing.renews", { date: date(it.currentPeriodEnd) })
                      : ""}
                </p>
                {it.hasSubscription ? (
                  <Button variant="outline" size="sm" disabled={busy === it.app} onClick={() => action(it.app, "portal")}>
                    {busy === it.app ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
                    {t("ui.billing.manage")}
                  </Button>
                ) : (
                  <Button size="sm" disabled={busy === it.app} onClick={() => action(it.app, "checkout")}>
                    {busy === it.app ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : it.courtesy ? <Gift className="mr-2 h-4 w-4" /> : <CreditCard className="mr-2 h-4 w-4" />}
                    {t("ui.billing.subscribe")}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
