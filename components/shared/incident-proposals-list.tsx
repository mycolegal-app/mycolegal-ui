"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCcw } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { useI18n } from "../i18n/i18n-context";
import { apiErrorMessage } from "../../lib/api-error";
import {
  IncidentProposalCard,
  type IncidentProposalEntry,
  type IncidentProposalIncidentSummary,
} from "./incident-proposal-card";

export interface IncidentProposalsListProps {
  /**
   * Base path for proposal endpoints (list / approve / reject). Defaults
   * to `/api/agent/admin` — admin's catch-all proxy that forwards to
   * auth's `/agent/admin/*`.
   */
  apiBase?: string;
  /**
   * Initial status filter. Comma-separated list, same shape as the API
   * accepts. Default: "pending,armed" — what a superadmin needs to act on.
   */
  initialStatus?: string;
  /** Optional fixRepo filter passed through to the API. */
  fixRepoFilter?: string;
  /** Optional incidentId filter (single-incident view). */
  incidentId?: string;
  /** Forwarded to each card so the list can open the incident page. */
  onOpenIncident?: (incident: IncidentProposalIncidentSummary) => void;
  className?: string;
}

interface ListResponse {
  data: IncidentProposalEntry[];
}

const FILTER_OPTIONS: readonly { value: string; key: string }[] = [
  { value: "pending,armed", key: "needs" },
  { value: "pending", key: "pending" },
  { value: "armed", key: "armed" },
  { value: "sent", key: "sent" },
  { value: "rejected", key: "rejected" },
  { value: "", key: "all" },
];

/**
 * Cross-org proposal feed for the admin panel. Polls every 30s while
 * mounted so a CLI-side proposal shows up without a page refresh. The
 * single-incident variant skips the filter UI — useful when the page is
 * already scoped to an incident detail view.
 */
export function IncidentProposalsList({
  apiBase = "/api/agent/admin",
  initialStatus = "pending,armed",
  fixRepoFilter,
  incidentId,
  onOpenIncident,
  className,
}: IncidentProposalsListProps) {
  const { t } = useI18n();
  const [status, setStatus] = useState(initialStatus);
  const [items, setItems] = useState<IncidentProposalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(
    async (silent = false) => {
      if (!silent) setRefreshing(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (status) params.set("status", status);
        if (fixRepoFilter) params.set("fixRepo", fixRepoFilter);
        if (incidentId) params.set("incidentId", incidentId);
        const url = `${apiBase}/proposals${params.size > 0 ? `?${params.toString()}` : ""}`;
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(
            apiErrorMessage(
              t,
              { status: res.status, code: j?.error?.code, message: typeof j?.error === "string" ? j.error : j?.error?.message },
              t("ui.incidentProposals.errLoad"),
            ),
          );
        }
        const body = (await res.json()) as ListResponse;
        setItems(body.data ?? []);
      } catch (e) {
        setError((e as Error).message || t("ui.incidentProposals.errLoad"));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [apiBase, status, fixRepoFilter, incidentId, t],
  );

  useEffect(() => {
    setLoading(true);
    fetchItems();
  }, [fetchItems]);

  // Background polling: 30s while mounted. Short enough that CLI-side
  // activity surfaces quickly without hammering auth.
  useEffect(() => {
    const id = setInterval(() => {
      fetchItems(true);
    }, 30_000);
    return () => clearInterval(id);
  }, [fetchItems]);

  const isSingleIncident = !!incidentId;

  return (
    <div className={cn("space-y-3", className)}>
      {!isSingleIncident && (
        <div className="flex flex-wrap items-center gap-2">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setStatus(opt.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                status === opt.value
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
              )}
            >
              {t(`ui.incidentProposals.filter.${opt.key}`)}
            </button>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => fetchItems()}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCcw className="h-3 w-3" />
            )}
          </Button>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("ui.incidentProposals.loading")}
        </div>
      )}

      {error && !loading && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
          {t("ui.incidentProposals.empty")}
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="space-y-3">
          {items.map((p) => (
            <IncidentProposalCard
              key={p.id}
              proposal={p}
              apiBase={apiBase}
              onChange={() => fetchItems()}
              onOpenIncident={onOpenIncident}
            />
          ))}
        </div>
      )}
    </div>
  );
}
