"use client";

import { useCallback, useEffect, useState } from "react";
import { NavLink as Link } from "../nav-link";
import { Loader2, Inbox, Plus } from "lucide-react";
import { PageTitle } from "../../layout/page-title";

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

const STATUS_COPY: Record<string, { label: string; tone: string }> = {
  open: { label: "Abierta", tone: "bg-amber-100 text-amber-800" },
  awaiting_user: { label: "Esperando tu respuesta", tone: "bg-cyan-100 text-cyan-800" },
  awaiting_admin: { label: "Esperando soporte", tone: "bg-cyan-100 text-cyan-800" },
  closed: { label: "Cerrada", tone: "bg-gray-100 text-gray-700" },
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
      setError((err as Error).message || "No se pudieron cargar las incidencias.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageTitle
        title="Mis incidencias"
        subtitle="Incidencias que has reportado desde esta aplicación u otras de la plataforma."
      />

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando…
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
          <p>Todavía no has abierto ninguna incidencia.</p>
          {onReport && (
            <button
              type="button"
              onClick={onReport}
              className="inline-flex items-center gap-2 rounded-lg bg-mc-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-mc-primary-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Reportar incidencia
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
                <th className="px-4 py-2">Descripción</th>
                <th className="px-4 py-2">Aplicación</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2">Última actividad</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const status = STATUS_COPY[i.status] || { label: i.status, tone: "bg-gray-100 text-gray-700" };
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
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${status.tone}`}>
                        {status.label}
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
