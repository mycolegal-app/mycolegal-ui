"use client";

/**
 * Pantalla bloqueante de re-aceptación de términos. Mientras el usuario tenga
 * documentos legales vigentes sin aceptar (condiciones, privacidad, DPA…), se
 * superpone a toda la app y exige aceptarlos antes de continuar.
 *
 * La monta el AppShell compartido en todas las apps de usuario. Es fail-safe:
 * si `/api/legal/pending` no existe (404) o falla, no bloquea (no hay nada que
 * aceptar). El backend exime a los superadmins.
 *
 * Requiere que la app exponga el proxy `/api/legal/*` hacia auth
 * (`/legal/pending`, `/legal/accept`) — ver `proxyToAuth` de
 * `@mycolegal-app/ui/server/auth-proxy`.
 */

import { useEffect, useState } from "react";
import { marked } from "marked";
import { useI18n } from "../i18n/i18n-context";

interface PendingDoc {
  id: string;
  kind: string;
  title: string;
  body: string;
  version: string;
  language: string;
}

async function fetchPending(): Promise<PendingDoc[]> {
  try {
    const res = await fetch("/api/legal/pending", { cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.pending) ? json.pending : [];
  } catch {
    return [];
  }
}

export function LegalGate() {
  const { t } = useI18n();
  const [pending, setPending] = useState<PendingDoc[] | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPending().then(setPending);
  }, []);

  // null = aún cargando; [] = nada pendiente. En ambos casos no renderizamos.
  if (!pending || pending.length === 0) return null;

  async function acceptAll() {
    setBusy(true);
    setError(null);
    try {
      for (const doc of pending!) {
        const res = await fetch("/api/legal/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId: doc.id }),
        });
        if (!res.ok) {
          setError(t("ui.legal.gateError"));
          return;
        }
      }
      const next = await fetchPending();
      setChecked(false);
      if (next.length === 0) {
        // Recargamos para que el estado de la app refleje el acceso ya concedido.
        window.location.reload();
      } else {
        setPending(next);
      }
    } catch {
      setError(t("ui.legal.gateError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 print:hidden"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="shrink-0 border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">{t("ui.legal.gateTitle")}</h2>
          <p className="mt-1 text-sm text-gray-500">{t("ui.legal.gateIntro")}</p>
        </div>

        <div className="flex-1 space-y-8 overflow-y-auto px-6 py-5">
          {pending.map((doc) => (
            <section key={doc.id}>
              <div
                className="legal-prose"
                dangerouslySetInnerHTML={{ __html: marked.parse(doc.body || "") as string }}
              />
            </section>
          ))}
        </div>

        <div className="shrink-0 space-y-3 border-t border-gray-200 px-6 py-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <label className="flex items-start gap-2.5 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>{t("ui.legal.gateAcceptLabel")}</span>
          </label>
          <button
            type="button"
            disabled={!checked || busy}
            onClick={acceptAll}
            className="w-full rounded-lg bg-navy-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? t("ui.legal.gateSubmitting") : t("ui.legal.gateContinue")}
          </button>
        </div>
      </div>
    </div>
  );
}
