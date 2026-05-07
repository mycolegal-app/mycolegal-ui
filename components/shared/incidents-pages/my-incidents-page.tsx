"use client";

import { useCallback, useEffect, useState } from "react";
import { NavLink as Link } from "../nav-link";
import { Loader2, Inbox, Plus } from "lucide-react";
import { PageTitle } from "../../layout/page-title";
import { useI18n } from "../../i18n/i18n-context";

interface IncidentListEntry {
  id: string;
  number: number;
  appSlug: string;
  description: string;
  status: string;
  closedByRole: string | null;
  lastActivityAt: string;
  createdAt: string;
}

const STATUS_TONES: Record<string, string> = {
  open: "bg-amber-100 text-amber-800",
  awaiting_user: "bg-cyan-100 text-cyan-800",
  awaiting_admin: "bg-cyan-100 text-cyan-800",
  closed: "bg-gray-100 text-gray-700",
};

const STATUS_LABEL_KEYS: Record<string, string> = {
  open: "ui.userAccount.status.open",
  awaiting_user: "ui.userAccount.status.awaitingUser",
  awaiting_admin: "ui.userAccount.status.awaitingAdmin",
  closed: "ui.userAccount.status.closed",
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * User-facing list of the caller's own incidents. The bell deep-links into
 * the detail view by number (/incidencias/:number); this page is the index
 * that lets the user find old ones without going through the bell.
 *
 * Shared across notaria/legifirma/archivo/… via `@mycolegal-app/ui`.
 *
 * `onReport` (opcional) habilita un CTA en el empty state. La app que la
 * monta lo enchufa al disparador del bug-reporter floating (típicamente abre
 * el modal global de incidencias). Si no se pasa, el empty state mantiene su
 * mensaje minimal sin botón.
 */
interface MyIncidentsPageProps {
  onReport?: () => void;
}

export function MyIncidentsPage({ onReport }: MyIncidentsPageProps = {}) {
  const { t } = useI18n();
  const [items, setItems] = useState<IncidentListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/incidents/mine?limit=100", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      setItems(body.data || []);
    } catch (err) {
      setError((err as Error).message || t("ui.myIncidents.errLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageTitle
        title={t("ui.myIncidents.title")}
        subtitle={t("ui.myIncidents.subtitle")}
      />

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("ui.docfilling.loading")}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 py-10 text-sm text-gray-500">
          <Inbox className="h-6 w-6" />
          <p>{t("ui.myIncidents.empty")}</p>
          {onReport && (
            <button
              type="button"
              onClick={onReport}
              className="inline-flex items-center gap-2 rounded-lg bg-mc-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-mc-primary-700"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("ui.myIncidents.btnReport")}
            </button>
          )}
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2">#</th>
                <th className="px-4 py-2">{t("ui.myIncidents.colDescription")}</th>
                <th className="px-4 py-2">{t("ui.myIncidents.colApp")}</th>
                <th className="px-4 py-2">{t("ui.myIncidents.colStatus")}</th>
                <th className="px-4 py-2">{t("ui.myIncidents.colLastActivity")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const tone = STATUS_TONES[i.status] || "bg-gray-100 text-gray-700";
                const labelKey = STATUS_LABEL_KEYS[i.status];
                const statusLabel = labelKey ? t(labelKey) : i.status;
                return (
                  <tr key={i.id} className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono font-medium text-gray-900">
                      <Link href={`/incidencias/${i.number}`} className="hover:underline">
                        #{i.number}
                      </Link>
                    </td>
                    <td className="max-w-md px-4 py-2 text-gray-700">
                      <Link href={`/incidencias/${i.number}`} className="hover:underline">
                        <span className="line-clamp-2">{i.description}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-gray-500">{i.appSlug}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${tone}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">{formatWhen(i.lastActivityAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
