"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Send, CheckCircle2, RotateCcw, AlertCircle } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { useI18n } from "../i18n/i18n-context";

export interface IncidentThreadIncident {
  id: string;
  number: number;
  description: string;
  status: string;
  closedByRole?: string | null;
  createdAt: string;
}

export interface IncidentThreadMessage {
  id: string;
  authorId: string;
  authorRole: "user" | "superadmin";
  body: string;
  createdAt: string;
}

interface IncidentThreadProps {
  /**
   * Base path for the thread's HTTP operations. The component appends
   * `/messages`, `/close`, `/reopen` to it. Examples:
   *   user:       "/api/incidents/mine/<uuid>"
   *   superadmin: "/api/orgs/<orgId>/incidents/<uuid>"
   */
  apiBase: string;
  incident: IncidentThreadIncident;
  viewerRole: "user" | "superadmin";
  /** Called after any state-changing mutation so the parent can refetch. */
  onRefresh?: () => void;
  /** Polling cadence for the thread while mounted. Default 15s. */
  pollIntervalMs?: number;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusCopy(
  status: string,
  closedByRole: string | null | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
): { label: string; tone: string } {
  switch (status) {
    case "open":
      return { label: t("ui.incidentThread.statusOpen"), tone: "bg-amber-100 text-amber-800" };
    case "awaiting_user":
      return { label: t("ui.incidentThread.statusAwaitingUser"), tone: "bg-cyan-100 text-cyan-800" };
    case "awaiting_admin":
      return { label: t("ui.incidentThread.statusAwaitingAdmin"), tone: "bg-cyan-100 text-cyan-800" };
    case "closed":
      return {
        label: closedByRole === "user"
          ? t("ui.incidentThread.statusClosedByUser")
          : t("ui.incidentThread.statusClosedBySupport"),
        tone: "bg-gray-100 text-gray-700",
      };
    default:
      return { label: status, tone: "bg-gray-100 text-gray-700" };
  }
}

/**
 * Dialog between a reporter and support on a single incident. The same
 * component renders in admin and in each user-facing app — the viewer role
 * just decides which actions are offered (Reopen is superadmin-only).
 *
 * Messages are polled every `pollIntervalMs` so a reply shows up without
 * the user having to refresh. Author-side avatars use two colours so it's
 * clear who said what without naming individual admins.
 */
export function IncidentThread({
  apiBase,
  incident,
  viewerRole,
  onRefresh,
  pollIntervalMs = 15_000,
}: IncidentThreadProps) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<IncidentThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeMode, setCloseMode] = useState(false);
  const [closeDraft, setCloseDraft] = useState("");
  const [reopening, setReopening] = useState(false);

  const fetchMessages = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${apiBase}/messages`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      setMessages(body.data || []);
    } catch (err) {
      setError((err as Error).message || t("ui.incidentThread.errLoad"));
    } finally {
      setLoading(false);
    }
  }, [apiBase, t]);

  useEffect(() => {
    fetchMessages();
    const id = setInterval(fetchMessages, pollIntervalMs);
    return () => clearInterval(id);
  }, [fetchMessages, pollIntervalMs]);

  const postReply = useCallback(async () => {
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || body?.error || `HTTP ${res.status}`);
      }
      setDraft("");
      await fetchMessages();
      onRefresh?.();
    } catch (err) {
      setError((err as Error).message || t("ui.incidentThread.errSend"));
    } finally {
      setPosting(false);
    }
  }, [apiBase, draft, fetchMessages, onRefresh, t]);

  const closeIncident = useCallback(async () => {
    const comment = closeDraft.trim();
    if (!comment) return;
    setClosing(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ comment }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || body?.error || `HTTP ${res.status}`);
      }
      setCloseMode(false);
      setCloseDraft("");
      await fetchMessages();
      onRefresh?.();
    } catch (err) {
      setError((err as Error).message || t("ui.incidentThread.errClose"));
    } finally {
      setClosing(false);
    }
  }, [apiBase, closeDraft, fetchMessages, onRefresh, t]);

  const reopenIncident = useCallback(async () => {
    setReopening(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/reopen`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || body?.error || `HTTP ${res.status}`);
      }
      await fetchMessages();
      onRefresh?.();
    } catch (err) {
      setError((err as Error).message || t("ui.incidentThread.errReopen"));
    } finally {
      setReopening(false);
    }
  }, [apiBase, fetchMessages, onRefresh, t]);

  const isClosed = incident.status === "closed";
  const status = statusCopy(incident.status, incident.closedByRole, t);

  const bodyLabel = viewerRole === "user" ? t("ui.incidentThread.bodyLabelUser") : t("ui.incidentThread.bodyLabelAdmin");

  return (
    <div className="flex flex-col gap-4">
      {/* Header with status + per-org number */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {t("ui.incidentThread.heading", { num: String(incident.number) })}
          </h2>
          <p className="text-xs text-gray-500">
            {t("ui.incidentThread.openedOn", { date: formatDateTime(incident.createdAt) })}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium",
            status.tone,
          )}
        >
          {status.label}
        </span>
      </div>

      {/* Original description */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
        <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">{bodyLabel}</p>
        <p className="whitespace-pre-wrap text-sm text-gray-800">{incident.description}</p>
      </div>

      {/* Thread */}
      <div className="space-y-3">
        {loading && messages.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("ui.incidentThread.loadingMessages")}
          </div>
        )}
        {!loading && messages.length === 0 && (
          <p className="text-sm text-gray-500">{t("ui.incidentThread.noMessages")}</p>
        )}
        {messages.map((m) => {
          const mine =
            (viewerRole === "user" && m.authorRole === "user") ||
            (viewerRole === "superadmin" && m.authorRole === "superadmin");
          return (
            <div
              key={m.id}
              className={cn(
                "flex gap-3",
                mine ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                  mine
                    ? "bg-cyan text-white"
                    : "bg-gray-100 text-gray-900 border border-gray-200",
                )}
              >
                <p
                  className={cn(
                    "mb-1 text-[11px] uppercase tracking-wide",
                    mine ? "text-white/70" : "text-gray-500",
                  )}
                >
                  {m.authorRole === "superadmin" ? t("ui.incidentThread.authorSupport") : t("ui.incidentThread.authorUser")}
                  {" · "}
                  {formatDateTime(m.createdAt)}
                </p>
                <p className="whitespace-pre-wrap">{m.body}</p>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Actions */}
      {!isClosed && !closeMode && (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder={
              viewerRole === "user"
                ? t("ui.incidentThread.replyToSupport")
                : t("ui.incidentThread.replyToUser")
            }
            disabled={posting}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setCloseMode(true)}
              disabled={posting}
            >
              <CheckCircle2 className="mr-1 h-4 w-4" />
              {t("ui.incidentThread.btnClose")}
            </Button>
            <Button onClick={postReply} disabled={posting || !draft.trim()}>
              {posting ? (
                <><Loader2 className="mr-1 h-4 w-4 animate-spin" />{t("ui.incidentThread.sending")}</>
              ) : (
                <><Send className="mr-1 h-4 w-4" />{t("ui.incidentThread.btnSend")}</>
              )}
            </Button>
          </div>
        </div>
      )}

      {!isClosed && closeMode && (
        <div className="space-y-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3">
          <p className="text-sm font-medium text-gray-900">{t("ui.incidentThread.btnClose")}</p>
          <p className="text-xs text-gray-600">
            {t("ui.incidentThread.closeHint")}
          </p>
          <Textarea
            value={closeDraft}
            onChange={(e) => setCloseDraft(e.target.value)}
            rows={3}
            placeholder={t("ui.incidentThread.closeCommentPlaceholder")}
            disabled={closing}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setCloseMode(false);
                setCloseDraft("");
              }}
              disabled={closing}
            >
              {t("ui.incidentThread.btnCancel")}
            </Button>
            <Button onClick={closeIncident} disabled={closing || !closeDraft.trim()}>
              {closing ? (
                <><Loader2 className="mr-1 h-4 w-4 animate-spin" />{t("ui.incidentThread.closing")}</>
              ) : (
                <><CheckCircle2 className="mr-1 h-4 w-4" />{t("ui.incidentThread.btnConfirmClose")}</>
              )}
            </Button>
          </div>
        </div>
      )}

      {isClosed && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={reopenIncident} disabled={reopening}>
            {reopening ? (
              <><Loader2 className="mr-1 h-4 w-4 animate-spin" />{t("ui.incidentThread.reopening")}</>
            ) : (
              <><RotateCcw className="mr-1 h-4 w-4" />{t("ui.incidentThread.btnReopen")}</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
