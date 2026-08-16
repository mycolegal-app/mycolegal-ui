"use client";

import { useCallback, useEffect, useState } from "react";
import { NavLink as Link } from "../nav-link";
import { Loader2, Inbox, Plus, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import { cn } from "../../../lib/utils";
import { PageTitle } from "../../layout/page-title";
import { useI18n } from "../../i18n/i18n-context";
import { apiErrorMessage } from "../../../lib/api-error";

interface IncidentListEntry {
  id: string;
  number: number;
  appSlug: string;
  /** Naturaleza del reporte: "incident" (por defecto) o "improvement". */
  kind?: string;
  description: string;
  status: string;
  closedByRole: string | null;
  lastActivityAt: string;
  createdAt: string;
  /** Present only on the org-wide view (managers): who reported it. */
  user?: { id: string; email: string; displayName: string } | null;
}

type Scope = "mine" | "org";
/** Filtro por naturaleza: todas / solo incidencias / solo mejoras. */
type KindFilter = "all" | "incident" | "improvement";

const KIND_TONES: Record<string, string> = {
  incident: "bg-amber-100 text-amber-800",
  improvement: "bg-cyan-100 text-cyan-800",
};

const KIND_LABEL_KEYS: Record<string, string> = {
  incident: "ui.myIncidents.kindIncident",
  improvement: "ui.myIncidents.kindImprovement",
};

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

/** Columnas ordenables (servidor). Se mapean 1:1 con el enum del backend. */
type SortField = "number" | "appSlug" | "status" | "lastActivityAt";

/** Cabecera clicable con indicador de orden (↕ inactiva, ↑/↓ activa). */
function SortableTh({
  field,
  label,
  sortBy,
  sortOrder,
  onSort,
}: {
  field: SortField;
  label: string;
  sortBy: SortField;
  sortOrder: "asc" | "desc";
  onSort: (field: SortField) => void;
}) {
  const active = sortBy === field;
  const Icon = !active ? ChevronsUpDown : sortOrder === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className="px-4 py-2">
      <button
        type="button"
        onClick={() => onSort(field)}
        className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-gray-800"
        aria-label={label}
      >
        {label}
        <Icon className={cn("h-3.5 w-3.5", active ? "text-gray-700" : "text-gray-300")} />
      </button>
    </th>
  );
}

/**
 * User-facing list of incidents. A plain user sees their own; an org manager
 * (superadmin / org_admin / admin:users) defaults to the org-wide view (all
 * incidents of the org, with the reporter) and can toggle back to just their
 * own. The backend (`canManage` on the list responses) decides which roles
 * unlock the org scope; `GET /api/incidents/org` returns 403 otherwise.
 *
 * Shared across notaria/legifirma/archivo/… via `@mycolegal-app/ui`.
 *
 * `onReport` (opcional) habilita un CTA en el empty state. La app que la
 * monta lo enchufa al disparador del bug-reporter floating.
 */
interface MyIncidentsPageProps {
  onReport?: () => void;
}

export function MyIncidentsPage({ onReport }: MyIncidentsPageProps = {}) {
  const { t } = useI18n();
  const [items, setItems] = useState<IncidentListEntry[]>([]);
  const [scope, setScope] = useState<Scope>("mine");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Orden por defecto = el del backend (actividad más reciente primero).
  const [sortBy, setSortBy] = useState<SortField>("lastActivityAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const loadScope = useCallback(
    async (s: Scope, sBy: SortField, sOrder: "asc" | "desc", kFilter: KindFilter) => {
      setLoading(true);
      setError(null);
      try {
        const ep = s === "org" ? "/api/incidents/org" : "/api/incidents/mine";
        const kindParam = kFilter !== "all" ? `&kind=${kFilter}` : "";
        const res = await fetch(`${ep}?limit=100&sortBy=${sBy}&sortOrder=${sOrder}${kindParam}`, { credentials: "include" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            apiErrorMessage(t, { status: res.status, code: body?.error?.code, message: body?.error?.message }, t("ui.myIncidents.errLoad")),
          );
        }
        const body = await res.json();
        setItems(body.data || []);
        if (typeof body.canManage === "boolean") setCanManage(body.canManage);
      } catch (err) {
        setError((err as Error).message || t("ui.myIncidents.errLoad"));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  // On mount: load the user's own list to learn `canManage`. A manager is
  // escalated to the org-wide view in the same pass (loading stays on, no
  // flash of the "mine" list). A plain user just keeps their own.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/incidents/mine?limit=100", { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        if (cancelled) return;
        const cm = body.canManage === true;
        setCanManage(cm);
        if (cm) {
          try {
            const r2 = await fetch("/api/incidents/org?limit=100", { credentials: "include" });
            if (!r2.ok) throw new Error(`HTTP ${r2.status}`);
            const b2 = await r2.json();
            if (cancelled) return;
            setScope("org");
            setItems(b2.data || []);
          } catch {
            // Org-wide view not wired in this app (no /api/incidents/org
            // proxy) — degrade to the user's own list and hide the toggle.
            if (cancelled) return;
            setCanManage(false);
            setScope("mine");
            setItems(body.data || []);
          }
        } else {
          setItems(body.data || []);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message || t("ui.myIncidents.errLoad"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const onScope = useCallback(
    (s: Scope) => {
      setScope(s);
      void loadScope(s, sortBy, sortOrder, kindFilter);
    },
    [loadScope, sortBy, sortOrder, kindFilter],
  );

  const onKind = useCallback(
    (k: KindFilter) => {
      setKindFilter(k);
      void loadScope(scope, sortBy, sortOrder, k);
    },
    [loadScope, scope, sortBy, sortOrder],
  );

  // Al pulsar una cabecera: si ya es la columna activa alterna asc/desc; si es
  // otra, arranca ascendente. Recarga el scope actual con el nuevo orden.
  const onSort = useCallback(
    (field: SortField) => {
      const nextOrder: "asc" | "desc" =
        field === sortBy ? (sortOrder === "asc" ? "desc" : "asc") : "asc";
      setSortBy(field);
      setSortOrder(nextOrder);
      void loadScope(scope, field, nextOrder, kindFilter);
    },
    [scope, sortBy, sortOrder, kindFilter, loadScope],
  );

  const isOrg = scope === "org";

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageTitle
        title={isOrg ? t("ui.myIncidents.titleOrg") : t("ui.myIncidents.title")}
        subtitle={isOrg ? t("ui.myIncidents.subtitleOrg") : t("ui.myIncidents.subtitle")}
      />

      <div className="flex flex-wrap items-center gap-2">
        {canManage && (
          <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs">
            {(["org", "mine"] as Scope[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onScope(s)}
                className={cn(
                  "rounded-md px-3 py-1 font-medium transition-colors",
                  scope === s
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-800",
                )}
              >
                {s === "org" ? t("ui.myIncidents.scopeOrg") : t("ui.myIncidents.scopeMine")}
              </button>
            ))}
          </div>
        )}

        {/* Filtro por naturaleza: todas / incidencias / mejoras. */}
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs">
          {(
            [
              ["all", "ui.myIncidents.kindFilterAll"],
              ["incident", "ui.myIncidents.kindFilterIncidents"],
              ["improvement", "ui.myIncidents.kindFilterImprovements"],
            ] as [KindFilter, string][]
          ).map(([k, labelKey]) => (
            <button
              key={k}
              type="button"
              onClick={() => onKind(k)}
              className={cn(
                "rounded-md px-3 py-1 font-medium transition-colors",
                kindFilter === k
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-800",
              )}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      </div>

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
          <p>{isOrg ? t("ui.myIncidents.emptyOrg") : t("ui.myIncidents.empty")}</p>
          {onReport && !isOrg && (
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
                <SortableTh field="number" label="#" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />
                <th className="px-4 py-2">{t("ui.myIncidents.colKind")}</th>
                <th className="px-4 py-2">{t("ui.myIncidents.colDescription")}</th>
                {isOrg && <th className="px-4 py-2">{t("ui.myIncidents.colReporter")}</th>}
                <SortableTh field="appSlug" label={t("ui.myIncidents.colApp")} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />
                <SortableTh field="status" label={t("ui.myIncidents.colStatus")} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />
                <SortableTh field="lastActivityAt" label={t("ui.myIncidents.colLastActivity")} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />
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
                    <td className="px-4 py-2">
                      {(() => {
                        const k = i.kind || "incident";
                        const kTone = KIND_TONES[k] || "bg-gray-100 text-gray-700";
                        const kLabelKey = KIND_LABEL_KEYS[k];
                        const kLabel = kLabelKey ? t(kLabelKey) : k;
                        return (
                          <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${kTone}`}>
                            {kLabel}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="max-w-md px-4 py-2 text-gray-700">
                      <Link href={`/incidencias/${i.number}`} className="hover:underline">
                        <span className="line-clamp-2">{i.description}</span>
                      </Link>
                    </td>
                    {isOrg && (
                      <td className="px-4 py-2 text-gray-500">
                        {i.user?.displayName || i.user?.email || "—"}
                      </td>
                    )}
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
