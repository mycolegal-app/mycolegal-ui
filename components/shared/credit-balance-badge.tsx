"use client";

import { useEffect, useState } from "react";
import { Coins } from "lucide-react";
import { useI18n } from "../i18n/i18n-context";
import { NavLink as Link } from "./nav-link";
import { cn } from "../../lib/utils";

/**
 * Indicador del saldo del monedero único de créditos de IA de la organización.
 * Se monta en la cabecera de cada app (mismo saldo en todas). Lee
 * `/api/credits/balance` (proxy a platform, accesible a cualquier usuario de la
 * org). Si no hay monedero / falla, no renderiza nada (no estorba).
 *
 * `href` opcional: enlaza al panel de suscripciones/compra de packs (p.ej.
 * "/admin/suscripcion") para que el usuario recargue créditos.
 */
export function CreditBalanceBadge({ href, className }: { href?: string; className?: string }) {
  const { t } = useI18n();
  const [total, setTotal] = useState<number | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/credits/balance");
        if (!res.ok) return;
        const data = await res.json();
        if (!alive) return;
        if (typeof data?.total === "number") {
          setTotal(data.total);
          setBlocked(Boolean(data.blocked));
        }
      } catch {
        /* silencioso: el indicador es opcional */
      }
    })();
    return () => { alive = false; };
  }, []);

  if (total === null) return null;

  const content = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-medium",
        blocked
          ? "border-mc-error-200 bg-mc-error-50 text-mc-error-700"
          : "border-mc-primary-200 bg-mc-primary-50 text-mc-primary-700",
        className,
      )}
      title={t("ui.billing.credits")}
    >
      <Coins className="h-4 w-4" />
      {t("ui.billing.creditsBalance", { n: String(total) })}
    </span>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}
