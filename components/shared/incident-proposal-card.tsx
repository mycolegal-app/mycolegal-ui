"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  GitBranch,
  Loader2,
  XCircle,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { useI18n } from "../i18n/i18n-context";
import { apiErrorMessage } from "../../lib/api-error";

export interface IncidentProposalIncidentSummary {
  id: string;
  number: number;
  orgId: string;
  appSlug: string;
  description: string;
  status: string;
  organization?: { name: string | null } | null;
  user?: { email: string; displayName: string | null } | null;
}

export interface IncidentProposalEntry {
  id: string;
  incidentReportId: string;
  kind: "reply" | "question" | "close" | "reopen";
  body: string;
  rationale?: string | null;
  proposedBy: string;
  status: "pending" | "armed" | "sent" | "rejected";
  fixCommit?: string | null;
  fixRepo?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewComment?: string | null;
  resultingMessageId?: string | null;
  createdAt: string;
  updatedAt: string;
  incident?: IncidentProposalIncidentSummary;
}

export interface IncidentProposalCardProps {
  proposal: IncidentProposalEntry;
  /**
   * Base path for the admin-facing approval/reject endpoints. Component
   * appends `/proposals/<id>/approve` and `/proposals/<id>/reject`.
   * Defaults to `/api/agent/admin` — admin's catch-all proxy.
   */
  apiBase?: string;
  /** Fired after a successful approve/reject so the parent list refetches. */
  onChange?: () => void;
  /**
   * Optional handler that lets the parent open the incident's full thread
   * page (e.g. `/incidencias/{orgId}#thread`). When provided, the card
   * renders a "ver incidencia" link.
   */
  onOpenIncident?: (incident: IncidentProposalIncidentSummary) => void;
  className?: string;
}

function kindColor(kind: IncidentProposalEntry["kind"]): string {
  switch (kind) {
    case "close":
      return "bg-emerald-100 text-emerald-800";
    case "question":
      return "bg-amber-100 text-amber-800";
    case "reopen":
      return "bg-purple-100 text-purple-800";
    case "reply":
    default:
      return "bg-sky-100 text-sky-800";
  }
}

function statusColor(status: IncidentProposalEntry["status"]): string {
  switch (status) {
    case "pending":
      return "bg-yellow-100 text-yellow-800";
    case "armed":
      return "bg-blue-100 text-blue-800";
    case "sent":
      return "bg-gray-100 text-gray-700";
    case "rejected":
      return "bg-red-100 text-red-700";
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Single proposal card. Renders the incident summary, the proposed
 * message, the agent's internal rationale (collapsible) and — only when
 * `status === 'pending'` — inline Edit + Approve + Reject controls.
 *
 * The "armed" state shows the fixCommit / fixRepo and a reminder that
 * the message will fire automatically on the next prod deploy. No edit
 * affordance is offered in `armed` to avoid drift between what was
 * approved and what eventually ships.
 */
export function IncidentProposalCard({
  proposal,
  apiBase = "/api/agent/admin",
  onChange,
  onOpenIncident,
  className,
}: IncidentProposalCardProps) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [editedBody, setEditedBody] = useState(proposal.body);
  const [showRationale, setShowRationale] = useState(false);
  const [busy, setBusy] = useState<null | "approve" | "reject">(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [confirmingReject, setConfirmingReject] = useState(false);

  const incident = proposal.incident;
  const editable = proposal.status === "pending";

  const approve = async () => {
    setBusy("approve");
    setError(null);
    try {
      const body: { editedBody?: string } = {};
      if (editing && editedBody.trim() && editedBody.trim() !== proposal.body) {
        body.editedBody = editedBody.trim();
      }
      const res = await fetch(`${apiBase}/proposals/${proposal.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          apiErrorMessage(
            t,
            { status: res.status, message: typeof j?.error === "string" ? j.error : j?.error?.message },
            t("ui.incidentProposals.errApprove"),
          ),
        );
      }
      onChange?.();
    } catch (e) {
      setError((e as Error).message || t("ui.incidentProposals.errApprove"));
    } finally {
      setBusy(null);
    }
  };

  const reject = async () => {
    setBusy("reject");
    setError(null);
    try {
      const res = await fetch(`${apiBase}/proposals/${proposal.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ comment: rejectComment.trim() || undefined }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          apiErrorMessage(
            t,
            { status: res.status, message: typeof j?.error === "string" ? j.error : j?.error?.message },
            t("ui.incidentProposals.errReject"),
          ),
        );
      }
      onChange?.();
    } catch (e) {
      setError((e as Error).message || t("ui.incidentProposals.errReject"));
    } finally {
      setBusy(null);
      setConfirmingReject(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg border border-gray-200 bg-white p-4 shadow-sm",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", kindColor(proposal.kind))}>
          {t(`ui.incidentProposals.kind.${proposal.kind}`)}
        </span>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusColor(proposal.status))}>
          {t(`ui.incidentProposals.status.${proposal.status}`)}
        </span>
        {proposal.fixCommit && proposal.fixRepo && (
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-mono text-indigo-700">
            <GitBranch className="h-3 w-3" />
            {proposal.fixRepo}@{proposal.fixCommit.slice(0, 10)}
          </span>
        )}
        <span className="ml-auto text-xs text-gray-500">
          {t("ui.incidentProposals.proposedBy", {
            who: proposal.proposedBy,
            date: formatDate(proposal.createdAt),
          })}
        </span>
      </div>

      {incident && (
        <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-gray-700">
          <span className="font-semibold">
            #{incident.number}
          </span>
          <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">
            {incident.appSlug}
          </span>
          {incident.organization?.name && (
            <span className="text-gray-600">· {incident.organization.name}</span>
          )}
          {incident.user && (
            <span className="text-gray-500">
              · {incident.user.displayName ?? incident.user.email}
            </span>
          )}
          {onOpenIncident && (
            <button
              type="button"
              onClick={() => onOpenIncident(incident)}
              className="ml-auto text-xs font-medium text-blue-600 hover:underline"
            >
              {t("ui.incidentProposals.openIncident")}
            </button>
          )}
        </div>
      )}

      {incident?.description && (
        <p className="mt-1 line-clamp-2 text-xs text-gray-500">
          {incident.description}
        </p>
      )}

      <div className="mt-4">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
          {t("ui.incidentProposals.messageLabel")}
        </div>
        {editing ? (
          <Textarea
            value={editedBody}
            onChange={(e) => setEditedBody(e.target.value)}
            rows={5}
            className="w-full"
            maxLength={4000}
          />
        ) : (
          <div className="whitespace-pre-wrap rounded-md border border-gray-100 bg-gray-50 p-3 text-sm text-gray-800">
            {proposal.body}
          </div>
        )}
      </div>

      {proposal.rationale && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowRationale((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
          >
            {showRationale ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            {t("ui.incidentProposals.rationaleToggle")}
          </button>
          {showRationale && (
            <pre className="mt-2 whitespace-pre-wrap rounded-md border border-amber-100 bg-amber-50 p-3 text-xs text-amber-900">
              {proposal.rationale}
            </pre>
          )}
        </div>
      )}

      {proposal.status === "armed" && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>{t("ui.incidentProposals.armedExplanation")}</p>
        </div>
      )}

      {proposal.status === "sent" && proposal.reviewedAt && (
        <div className="mt-3 text-xs text-gray-500">
          {t("ui.incidentProposals.sentAt", { date: formatDate(proposal.reviewedAt) })}
        </div>
      )}

      {proposal.status === "rejected" && (
        <div className="mt-3 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-800">
          <div className="flex items-center gap-2 font-medium">
            <XCircle className="h-4 w-4" />
            {t("ui.incidentProposals.rejectedHeading")}
          </div>
          {proposal.reviewComment && (
            <p className="mt-1 whitespace-pre-wrap">{proposal.reviewComment}</p>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {editable && (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-3">
          {editing ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEditing(false);
                setEditedBody(proposal.body);
              }}
              disabled={busy !== null}
            >
              {t("ui.incidentProposals.btnCancelEdit")}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
              disabled={busy !== null}
            >
              {t("ui.incidentProposals.btnEdit")}
            </Button>
          )}
          {!confirmingReject ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmingReject(true)}
                disabled={busy !== null}
              >
                {t("ui.incidentProposals.btnReject")}
              </Button>
              <Button type="button" size="sm" onClick={approve} disabled={busy !== null}>
                {busy === "approve" ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    {t("ui.incidentProposals.approving")}
                  </>
                ) : (
                  t("ui.incidentProposals.btnApprove")
                )}
              </Button>
            </>
          ) : (
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-end">
              <Textarea
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
                placeholder={t("ui.incidentProposals.rejectCommentPlaceholder")}
                rows={2}
                className="flex-1"
                maxLength={500}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setConfirmingReject(false);
                    setRejectComment("");
                  }}
                  disabled={busy !== null}
                >
                  {t("ui.incidentProposals.btnCancel")}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={reject}
                  disabled={busy !== null}
                >
                  {busy === "reject" ? (
                    <>
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      {t("ui.incidentProposals.rejecting")}
                    </>
                  ) : (
                    t("ui.incidentProposals.btnConfirmReject")
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
