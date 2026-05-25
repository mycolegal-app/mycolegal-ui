"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { NavLink as Link } from "../nav-link";
import { ChevronLeft, Loader2 } from "lucide-react";
import { IncidentThread, type IncidentThreadIncident } from "../incident-thread";
import { PageTitle } from "../../layout/page-title";
import { useI18n } from "../../i18n/i18n-context";
import { apiErrorMessage } from "../../../lib/api-error";

/**
 * User-facing detail view for an incident the logged-in user reported.
 * Deep-linked from the notifications bell (link = /incidencias/:number).
 *
 * Shared across notaria/legifirma/archivo/… via `@mycolegal-app/ui`.
 */
export function IncidentDetailPage() {
  const { t } = useI18n();
  const params = useParams<{ number: string }>();
  const numberParam = params?.number;

  const [incident, setIncident] = useState<IncidentThreadIncident | null>(null);
  // A superadmin can open a teammate's incident here (read-only). The
  // backend flags whether the caller is the reporter; non-reporters get a
  // view without reply/close/reopen. Defaults to owner so the regular
  // user flow keeps full interaction.
  const [readOnly, setReadOnly] = useState(false);
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
        if (res.status === 404) throw new Error(t("ui.incidentDetail.errNotFound"));
        const body = await res.json().catch(() => ({}));
        throw new Error(
          apiErrorMessage(t, { status: res.status, code: body?.error?.code, message: body?.error?.message }, t("ui.incidentDetail.errLoad")),
        );
      }
      const body = await res.json();
      setIncident(body.data);
      setReadOnly(body.data?.viewerIsReporter === false);
    } catch (err) {
      setError((err as Error).message || t("ui.incidentDetail.errLoad"));
    } finally {
      setLoading(false);
    }
  }, [numberParam, t]);

  useEffect(() => {
    fetchIncident();
  }, [fetchIncident]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageTitle
        title={incident ? t("ui.incidentDetail.titleWithNumber", { num: String(incident.number) }) : t("ui.incidentDetail.title")}
        subtitle={t("ui.incidentDetail.subtitle")}
      />
      <Link
        href="/incidencias"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
      >
        <ChevronLeft className="h-4 w-4" />
        {t("ui.incidentDetail.back")}
      </Link>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("ui.incidentDetail.loadingIncident")}
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
          readOnly={readOnly}
        />
      )}
    </div>
  );
}
