"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins, Loader2 } from "lucide-react";
import { useI18n } from "../i18n/i18n-context";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { toast } from "../../hooks/use-toast";

/**
 * Modal de compra de packs de créditos de IA, disparado desde el indicador de
 * saldo de la cabecera (SOLO org_admin). Consume los proxies compartidos
 * `/api/credits/{balance,packs,purchase,checkout}` que expone cada app vía
 * `createCreditsRoutes`. El proxy exige `billing:write` en las escrituras: aunque
 * un no-admin abriera esto, la compra devolvería 403.
 *
 * Flujo de compra (idéntico al CreditsCard de Config): primero intenta la tarjeta
 * on-file (sin salir de la app); si no hay tarjeta o Stripe pide 3DS, cae al
 * Checkout redirigido. Los créditos entran vía webhook de Stripe.
 */

interface Wallet {
  total: number;
  subscriptionBalance: number;
  purchasedBalance: number;
  blocked?: boolean;
  cycleResetAt?: string | null;
}

interface Pack {
  id: string;
  name: string;
  credits: number;
  priceCents: number;
  currency: string;
}

const eur = (cents: number) =>
  (cents / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function CreditsPurchaseModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadBalance = useCallback(
    () =>
      fetch("/api/credits/balance")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d && typeof d.total === "number") setWallet(d);
        })
        .catch(() => {}),
    [],
  );

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void Promise.all([
      loadBalance(),
      fetch("/api/credits/packs")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setPacks(d?.data ?? []))
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [open, loadBalance]);

  // Fallback: Checkout redirigido (recoge tarjeta / resuelve 3DS).
  async function buyViaCheckout(pack: Pack) {
    const returnUrl = window.location.href;
    const res = await fetch("/api/credits/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packId: pack.id, successUrl: returnUrl, cancelUrl: returnUrl }),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.url) window.location.href = data.url as string;
    else toast({ title: t("ui.billing.actionError"), variant: "destructive" });
  }

  async function buy(pack: Pack) {
    setBusy(pack.id);
    try {
      // 1) Tarjeta on-file (sin salir de la app).
      const res = await fetch("/api/credits/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId: pack.id }),
      });
      if (res.ok) {
        const status = (await res.json())?.data?.status as string | undefined;
        if (status === "ok") {
          toast({ title: t("ui.billing.buyInProgress"), variant: "success" });
          setTimeout(() => void loadBalance(), 2500);
          return;
        }
        // no_payment_method | requires_action → Checkout que recoge tarjeta / 3DS.
        await buyViaCheckout(pack);
        return;
      }
      if (res.status === 403) {
        toast({ title: t("ui.billing.adminOnly"), variant: "destructive" });
        return;
      }
      if (res.status === 503) {
        toast({ title: t("ui.billing.paymentsUnavailable"), variant: "destructive" });
        return;
      }
      await buyViaCheckout(pack);
    } catch {
      toast({ title: t("ui.billing.actionError"), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5" /> {t("ui.billing.walletTitle")}
          </DialogTitle>
          <DialogDescription>{t("ui.billing.buyCredits")}</DialogDescription>
        </DialogHeader>

        {wallet && (
          <div className="grid grid-cols-3 gap-3 rounded-lg border p-3 text-sm">
            <div>
              <span className="block text-xs text-gray-400">{t("ui.billing.creditsTotal")}</span>
              <span className="text-lg font-bold">{wallet.total.toLocaleString("es-ES")}</span>
            </div>
            <div>
              <span className="block text-xs text-gray-400">{t("ui.billing.creditsSub")}</span>
              <span className="font-medium">{wallet.subscriptionBalance.toLocaleString("es-ES")}</span>
            </div>
            <div>
              <span className="block text-xs text-gray-400">{t("ui.billing.creditsBought")}</span>
              <span className="font-medium">{wallet.purchasedBalance.toLocaleString("es-ES")}</span>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-6 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : packs.length > 0 ? (
          <div className="space-y-2">
            {packs.map((p) => (
              <Button
                key={p.id}
                variant="outline"
                disabled={busy === p.id}
                onClick={() => void buy(p)}
                className="h-auto w-full justify-between py-2.5"
              >
                <span>
                  {p.name} · {p.credits.toLocaleString("es-ES")} {t("ui.billing.credits")}
                </span>
                <span className="shrink-0">
                  {busy === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : `${eur(p.priceCents)} € + IVA`}
                </span>
              </Button>
            ))}
            <p className="text-xs text-gray-500">{t("ui.billing.vatNote")}</p>
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-gray-400">{t("ui.billing.noPacks")}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
