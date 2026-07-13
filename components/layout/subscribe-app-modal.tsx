"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import type { AppInfo } from "./app-info";

/**
 * App no concedida, tal como la sirve auth en `sellableExtras` de /api/auth/me:
 * el AppInfo de siempre + el copy de venta y el precio de su plan de billing.
 */
export interface SubscribableApp extends AppInfo {
  /** Copy de venta del plan (el mismo que ve en el selector del registro). */
  description?: string | null;
  /** true → se puede contratar ya; false → "Próximamente" (solo registrar interés). */
  sellable?: boolean;
  priceCents?: number | null;
  currency?: string;
}

interface SubscribeAppModalProps {
  app: SubscribableApp;
  onClose: () => void;
  /** Se llama tras suscribir con éxito, para refrescar la toolbar. */
  onSubscribed?: () => void;
}

function money(cents: number, currency = "eur") {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

/**
 * Modal que se abre al pulsar una app gris de la toolbar. Si la app es vendible
 * muestra precio y permite contratarla en el sitio (la org ya tiene tarjeta y
 * suscripción viva desde el alta, así que basta con añadir el ítem: no hace falta
 * pasar por el checkout de Stripe). Si aún no es vendible, ofrece registrar el
 * interés para avisarle cuando se lance.
 */
export function SubscribeAppModal({ app, onClose, onSubscribed }: SubscribeAppModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"subscribed" | "interested" | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sellable = app.sellable !== false;

  async function act(endpoint: string, ok: "subscribed" | "interested") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app: app.slug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 409: la org no tiene suscripción viva (caso raro: alta antigua sin
        // tarjeta). La mandamos a Config, que sí sabe abrir un checkout.
        if (res.status === 409) {
          setError("Tu notaría aún no tiene una suscripción activa. Ve a Configuración → Suscripción para contratarla.");
          return;
        }
        setError(data?.message || "No se ha podido completar la operación. Inténtalo de nuevo.");
        return;
      }
      setDone(ok);
      if (ok === "subscribed") onSubscribed?.();
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="subscribe-app-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3">
          {app.logoSvg && (
            <span
              className="mt-0.5 h-10 w-10 shrink-0 [&>svg]:h-full [&>svg]:w-full"
              // El logo lo sirve nuestro propio backend desde el catálogo de apps.
              dangerouslySetInnerHTML={{ __html: app.logoSvg }}
            />
          )}
          <div className="min-w-0">
            <h2 id="subscribe-app-title" className="text-lg font-bold text-slate-900">
              {app.name}
            </h2>
            {!sellable && (
              <span className="mt-1 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                Próximamente
              </span>
            )}
          </div>
        </div>

        {app.description && (
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{app.description}</p>
        )}

        {done === "subscribed" ? (
          <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            <strong>¡Listo!</strong> Ya tienes {app.name}. Recarga la página para verla en la barra de aplicaciones.
          </div>
        ) : done === "interested" ? (
          <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            <strong>✓ Interés registrado.</strong> Te avisaremos en cuanto {app.name} esté disponible.
          </div>
        ) : (
          <>
            {sellable && typeof app.priceCents === "number" && (
              <div className="mt-4 flex items-baseline justify-between rounded-lg bg-slate-50 px-3 py-2.5">
                <span className="text-sm text-slate-600">Precio</span>
                <span className="text-right">
                  <span className="block text-lg font-bold text-slate-900">
                    {money(app.priceCents, app.currency)}
                  </span>
                  <span className="text-xs text-slate-500">/ mes + IVA</span>
                </span>
              </div>
            )}

            {error && (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  // El mismo proxy de billing que ya usa Config (factory
                  // createBillingRoutes): reenvía a platform forzando el orgId de
                  // la sesión. No hay lógica de suscripción duplicada aquí.
                  sellable
                    ? act("/api/billing/add-app", "subscribed")
                    : act("/api/billing/interest", "interested")
                }
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-cyan px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {sellable ? "Suscribir" : "Estoy interesado"}
              </button>
            </div>

            {/* Sin promesas de prueba gratis: los 30 días son del alta. Una app
                añadida después entra en la suscripción viva y se cobra prorrateada
                desde hoy con la tarjeta ya registrada. */}
            <p className="mt-3 text-center text-xs text-slate-400">
              {sellable
                ? "Se añade a tu suscripción actual, prorrateada desde hoy, con la tarjeta que ya tienes registrada."
                : "No contratas ni pagas nada: solo anotamos tu interés."}
            </p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
