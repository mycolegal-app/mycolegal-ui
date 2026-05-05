"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { NavLink as Link } from "../nav-link";
import { ChevronLeft, Loader2 } from "lucide-react";
import { IncidentThread, type IncidentThreadIncident } from "../incident-thread";
import { PageTitle } from "../../layout/page-title";

/**
 * User-facing detail view for an incident the logged-in user reported.
 * Deep-linked from the notifications bell (link = /incidencias/:number).
 *
 * Shared across notaria/legifirma/archivo/… via `@mycolegal-app/ui`.
 */
export function IncidentDetailPage() {
  const params = useParams<{ number: string }>();
  const numberParam = params?.number;

  const [incident, setIncident] = useState<IncidentThreadIncident | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIncident = useCallback(async () => {
    if (!numberParam) return;
    setError(null);
    try {
      const res = await fetch(`/api/incidents/mine/by-number/${numberParam}`, {
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 404) throw new Error("No encontramos esta incidencia.");
        throw new Error(`HTTP ${res.status}`);
      }
      const body = await res.json();
      setIncident(body.data);
    } catch (err) {
      setError((err as Error).message || "No se pudo cargar la incidencia.");
    } finally {
      setLoading(false);
    }
  }, [numberParam]);

  useEffect(() => {
    fetchIncident();
  }, [fetchIncident]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageTitle
        title={incident ? `Incidencia #${incident.number}` : "Incidencia"}
        subtitle="Detalle de la incidencia"
      />
      <Link
        href="/incidencias"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
      >
        <ChevronLeft className="h-4 w-4" />
        Volver
      </Link>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando incidencia…
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {incident && (
        <IncidentThread
          apiBase={`/api/incidents/mine/${incident.id}`}
          incident={incident}
          viewerRole="user"
          onRefresh={fetchIncident}
        />
      )}
    </div>
  );
}
