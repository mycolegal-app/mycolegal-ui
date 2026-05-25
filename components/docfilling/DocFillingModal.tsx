"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Download, FileText, Loader2, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { useI18n } from "../i18n/i18n-context";
import { apiErrorMessage } from "../../lib/api-error";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AvailableDocument {
  id: string;
  name: string;
  url: string;
  contentType: string;
}

export interface DocFillingModalProps {
  open: boolean;
  onClose: () => void;
  /** Base URL of mycolegal-docfilling (e.g. http://docfilling:3005) */
  serviceUrl: string;
  /** Value for X-Service-Key header */
  serviceKey: string;
  orgId: string;
  /** Bearer token of the current user (forwarded to inter-service calls) */
  userToken?: string;
  // Caller context
  appSlug: string;
  entityType?: string;
  triggerState?: string;
  // Pre-filled field values
  prefillFields?: Record<string, string>;
  // Skip template selection if pre-selected
  templateId?: number;
  // Available source documents from the entity (actuacion, expediente, etc.)
  availableDocuments?: AvailableDocument[];
  // Callbacks
  onDocumentGenerated?: (doc: { taskId: number; fileName: string }) => void;
  onActionsCompleted?: (phase: "pre" | "post", completed: string[]) => void;
}

interface BindingTemplate {
  id: number;
  name: string;
  description: string | null;
}

interface Binding {
  id: string;
  template_id: number;
  template: BindingTemplate | null;
  field_mapping: Record<string, string>;
  auto_generate: boolean;
  is_default: boolean;
}

interface HumanActions {
  init: string[];
  pre: string[];
  post: string[];
}

type Phase =
  | "select"
  | "fields"
  | "sourceDocuments"
  | "preActions"
  | "generating"
  | "result"
  | "postActions";

type TaskStatus = "pending" | "processing" | "completed" | "failed" | "incomplete" | string;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function interHeaders(serviceKey: string, orgId: string, userToken?: string): HeadersInit {
  const h: Record<string, string> = {
    "X-Service-Key": serviceKey,
    "X-Org-Id": orgId,
  };
  if (userToken) h["Authorization"] = `Bearer ${userToken}`;
  return h;
}

const POLL_INTERVAL = 2500;
const MAX_POLLS = 60;

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

const PHASE_LABELS: Array<{ phase: Phase; labelKey: string }> = [
  { phase: "select", labelKey: "ui.docfilling.phaseTemplate" },
  { phase: "fields", labelKey: "ui.docfilling.phaseFields" },
  { phase: "sourceDocuments", labelKey: "ui.docfilling.phaseDocuments" },
  { phase: "preActions", labelKey: "ui.docfilling.phasePre" },
  { phase: "generating", labelKey: "ui.docfilling.phaseGenerating" },
  { phase: "result", labelKey: "ui.docfilling.phaseResult" },
  { phase: "postActions", labelKey: "ui.docfilling.phasePost" },
];

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors",
          done && "border-green-500 bg-green-500 text-white",
          active && !done && "border-blue-600 bg-blue-600 text-white",
          !active && !done && "border-gray-300 bg-white text-gray-400",
        )}
      >
        {done ? <Check className="h-3.5 w-3.5" /> : null}
      </div>
      <span className={cn("text-xs", active ? "text-blue-600 font-medium" : "text-gray-400")}>
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase: Template selection
// ---------------------------------------------------------------------------

function PhaseSelect({
  bindings,
  loading,
  onSelect,
}: {
  bindings: Binding[];
  loading: boolean;
  onSelect: (binding: Binding) => void;
}) {
  const { t } = useI18n();
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
      </div>
    );
  }

  if (bindings.length === 0) {
    return (
      <div className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-700">
        {t("ui.docfilling.noTemplates")}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-500 mb-4">{t("ui.docfilling.selectIntro")}</p>
      {bindings.map((b) => (
        <button
          key={b.id}
          onClick={() => onSelect(b)}
          className="w-full flex items-center justify-between rounded-lg border border-gray-200 p-4 text-left hover:border-blue-300 hover:bg-blue-50 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-gray-400 group-hover:text-blue-500" />
            <div>
              <p className="text-sm font-medium text-gray-900">
                {b.template?.name ?? t("ui.docfilling.templateFallback", { id: String(b.template_id) })}
              </p>
              {b.template?.description && (
                <p className="text-xs text-gray-500 mt-0.5">{b.template.description}</p>
              )}
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-blue-500" />
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase: Field review
// ---------------------------------------------------------------------------

function PhaseFields({
  binding,
  prefillFields,
  editableFields,
  onFieldChange,
  onNext,
  nextLabel,
  generating,
}: {
  binding: Binding;
  prefillFields: Record<string, string>;
  editableFields: Record<string, string>;
  onFieldChange: (key: string, value: string) => void;
  onNext: () => void;
  nextLabel: string;
  generating: boolean;
}) {
  const { t } = useI18n();
  const mapping = binding.field_mapping;
  const allKeys = Object.keys(mapping);

  if (allKeys.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-500">{t("ui.docfilling.noFields")}</p>
        <Button onClick={onNext} disabled={generating} className="w-full">
          {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {nextLabel}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{t("ui.docfilling.fieldsIntro")}</p>
      <div className="space-y-3">
        {allKeys.map((dfField) => {
          const sourceKey = mapping[dfField];
          const prefilled = prefillFields[dfField] ?? prefillFields[sourceKey];
          const isPrefilled = prefilled !== undefined && prefilled !== "";
          const value = isPrefilled ? prefilled : (editableFields[dfField] ?? "");

          return (
            <div key={dfField}>
              <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-1">
                <span>{dfField}</span>
                {isPrefilled && (
                  <span className="inline-flex items-center gap-0.5 text-green-600 text-xs">
                    <Check className="h-3 w-3" /> {t("ui.docfilling.auto")}
                  </span>
                )}
              </label>
              <input
                type="text"
                value={value}
                onChange={(e) => !isPrefilled && onFieldChange(dfField, e.target.value)}
                readOnly={isPrefilled}
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-sm",
                  isPrefilled
                    ? "border-green-200 bg-green-50 text-green-800"
                    : "border-gray-200 bg-white focus:border-blue-400 focus:outline-none",
                )}
                placeholder={isPrefilled ? "" : t("ui.docfilling.valuePlaceholder", { field: dfField })}
              />
              {sourceKey && (
                <p className="text-xs text-gray-400 mt-0.5 font-mono">{sourceKey}</p>
              )}
            </div>
          );
        })}
      </div>
      <Button onClick={onNext} disabled={generating} className="w-full mt-2">
        {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {nextLabel}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase: Source document selection
// ---------------------------------------------------------------------------

function PhaseSourceDocuments({
  documents,
  selected,
  onToggle,
  onNext,
  onSkip,
}: {
  documents: AvailableDocument[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-gray-900">{t("ui.docfilling.sourceTitle")}</p>
        <p className="text-xs text-gray-500 mt-1">
          {t("ui.docfilling.sourceIntro")}
        </p>
      </div>
      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
        {documents.map((doc) => (
          <label
            key={doc.id}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
              selected.has(doc.id)
                ? "border-blue-300 bg-blue-50"
                : "border-gray-200 hover:border-gray-300",
            )}
          >
            <input
              type="checkbox"
              checked={selected.has(doc.id)}
              onChange={() => onToggle(doc.id)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600"
            />
            <FileText className="h-4 w-4 text-gray-400 shrink-0" />
            <span className="text-sm text-gray-900 truncate">{doc.name}</span>
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <Button onClick={onNext} disabled={selected.size === 0} className="flex-1">
          {selected.size === 1
            ? t("ui.docfilling.continueWithOne", { count: String(selected.size) })
            : t("ui.docfilling.continueWithMany", { count: String(selected.size) })}
        </Button>
        <Button variant="outline" onClick={onSkip}>
          {t("ui.docfilling.skip")}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase: Actions checklist (pre or post)
// ---------------------------------------------------------------------------

function PhaseActions({
  phase,
  actions,
  checked,
  onToggle,
  onConfirm,
  confirmLabel,
  confirmDisabled,
  onDownload,
  downloadUrl,
}: {
  phase: "pre" | "post";
  actions: string[];
  checked: Set<number>;
  onToggle: (i: number) => void;
  onConfirm: () => void;
  confirmLabel: string;
  confirmDisabled: boolean;
  onDownload?: () => void;
  downloadUrl?: string;
}) {
  const { t } = useI18n();
  const isPre = phase === "pre";

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-gray-900">
          {isPre ? t("ui.docfilling.preTitle") : t("ui.docfilling.postTitle")}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {isPre
            ? t("ui.docfilling.preIntro")
            : t("ui.docfilling.postIntro")}
        </p>
      </div>
      <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
        {actions.map((action, i) => (
          <label
            key={i}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
              checked.has(i)
                ? "border-green-300 bg-green-50"
                : "border-gray-200 hover:border-gray-300",
            )}
          >
            <input
              type="checkbox"
              checked={checked.has(i)}
              onChange={() => onToggle(i)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600"
            />
            <span className={cn("text-sm", checked.has(i) ? "text-green-800 line-through" : "text-gray-900")}>
              {action}
            </span>
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        {downloadUrl && (
          <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            {t("ui.docfilling.download")}
          </a>
        )}
        <Button onClick={onConfirm} disabled={confirmDisabled} className="flex-1">
          {confirmLabel}
        </Button>
        {!isPre && onDownload && (
          <Button variant="outline" onClick={onDownload}>
            {t("ui.docfilling.close")}
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase: Generating
// ---------------------------------------------------------------------------

function PhaseGenerating({ status }: { status: TaskStatus }) {
  const { t } = useI18n();
  const messageKeys: Record<string, string> = {
    pending: "ui.docfilling.statusPending",
    processing: "ui.docfilling.statusProcessing",
  };

  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
      <p className="text-sm font-medium text-gray-700">
        {messageKeys[status] ? t(messageKeys[status]) : t("ui.docfilling.statusGenerating")}
      </p>
      <p className="text-xs text-gray-400">{t("ui.docfilling.statusHint")}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase: Result (incomplete fields or success)
// ---------------------------------------------------------------------------

function PhaseResult({
  taskId,
  documentUrl,
  incompleteFields,
  onRegenerate,
  onAccept,
  regenerating,
}: {
  taskId: number;
  documentUrl?: string;
  incompleteFields: string[];
  onRegenerate: (completedFields: Record<string, string>) => void;
  onAccept: () => void;
  regenerating: boolean;
}) {
  const { t } = useI18n();
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(incompleteFields.map((f) => [f, ""])),
  );

  const allFilled = incompleteFields.every((f) => fieldValues[f]?.trim());

  if (incompleteFields.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <Check className="h-7 w-7 text-green-600" />
        </div>
        <p className="text-base font-medium text-gray-900">{t("ui.docfilling.docGenerated")}</p>
        <p className="text-xs text-gray-400">{t("ui.docfilling.taskNumber", { id: String(taskId) })}</p>
        <div className="flex gap-3">
          {documentUrl && (
            <a
              href={documentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Download className="h-4 w-4" />
              {t("ui.docfilling.download")}
            </a>
          )}
          <Button variant="outline" onClick={onAccept}>
            {documentUrl ? t("ui.docfilling.continue") : t("ui.docfilling.close")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
        {incompleteFields.length === 1
          ? t("ui.docfilling.incompleteOne", { count: String(incompleteFields.length) })
          : t("ui.docfilling.incompleteMany", { count: String(incompleteFields.length) })}
      </div>
      <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
        {incompleteFields.map((field) => (
          <div key={field}>
            <label className="block text-xs font-medium text-gray-700 mb-1">{field}</label>
            <input
              type="text"
              value={fieldValues[field] ?? ""}
              onChange={(e) => setFieldValues((prev) => ({ ...prev, [field]: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
              placeholder={t("ui.docfilling.valuePlaceholder", { field })}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        {documentUrl && (
          <a
            href={documentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            {t("ui.docfilling.downloadAsIs")}
          </a>
        )}
        <Button
          onClick={() => onRegenerate(fieldValues)}
          disabled={!allFilled || regenerating}
          className="flex-1"
        >
          {regenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {t("ui.docfilling.completeAndRegenerate")}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

export function DocFillingModal({
  open,
  onClose,
  serviceUrl,
  serviceKey,
  orgId,
  userToken,
  appSlug,
  entityType,
  triggerState,
  prefillFields = {},
  templateId,
  availableDocuments = [],
  onDocumentGenerated,
  onActionsCompleted,
}: DocFillingModalProps) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>(templateId ? "fields" : "select");
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [loadingBindings, setLoadingBindings] = useState(false);
  const [selectedBinding, setSelectedBinding] = useState<Binding | null>(null);
  const [editableFields, setEditableFields] = useState<Record<string, string>>({});
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [preActionsChecked, setPreActionsChecked] = useState<Set<number>>(new Set());
  const [postActionsChecked, setPostActionsChecked] = useState<Set<number>>(new Set());
  const [taskId, setTaskId] = useState<number | null>(null);
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("pending");
  const [documentUrl, setDocumentUrl] = useState<string | undefined>();
  const [incompleteFields, setIncompleteFields] = useState<string[]>([]);
  const [humanActions, setHumanActions] = useState<HumanActions>({ init: [], pre: [], post: [] });
  const [preActionsLoading, setPreActionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const pollCount = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const headers = interHeaders(serviceKey, orgId, userToken);

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setPhase(templateId ? "fields" : "select");
      setSelectedBinding(null);
      setEditableFields({});
      setSelectedDocIds(new Set());
      setPreActionsChecked(new Set());
      setPostActionsChecked(new Set());
      setTaskId(null);
      setTaskStatus("pending");
      setDocumentUrl(undefined);
      setIncompleteFields([]);
      setHumanActions({ init: [], pre: [], post: [] });
      setError(null);
      setRegenerating(false);
      pollCount.current = 0;
    }
  }, [open, templateId]);

  // Load bindings when in select phase
  useEffect(() => {
    if (!open || phase !== "select") return;
    setLoadingBindings(true);
    const qs = new URLSearchParams({ app: appSlug });
    if (entityType) qs.set("entityType", entityType);
    if (triggerState) qs.set("state", triggerState);

    fetch(`${serviceUrl}/api/inter/bindings?${qs}`, { headers })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => setBindings(d.data ?? []))
      .catch(() => setError(t("ui.docfilling.errLoadTemplates")))
      .finally(() => setLoadingBindings(false));
  }, [open, phase, serviceUrl, appSlug, entityType, triggerState]);

  // If templateId pre-selected, create a synthetic binding
  useEffect(() => {
    if (open && templateId && !selectedBinding) {
      setSelectedBinding({
        id: "preselected",
        template_id: templateId,
        template: null,
        field_mapping: {},
        auto_generate: false,
        is_default: false,
      });
    }
  }, [open, templateId, selectedBinding]);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const pollStatus = useCallback(
    async (id: number) => {
      if (pollCount.current >= MAX_POLLS) {
        setError(t("ui.docfilling.errTimeout"));
        setPhase("result");
        return;
      }
      pollCount.current += 1;

      try {
        const res = await fetch(`${serviceUrl}/api/inter/status/${id}`, { headers });
        if (!res.ok) throw new Error(`${res.status}`);
        const { data } = await res.json();
        setTaskStatus(data.status);

        if (data.status === "completed") {
          setDocumentUrl(data.documentUrl);
          setIncompleteFields(data.incompleteFields ?? []);
          const ha: HumanActions = data.humanActions ?? { init: [], pre: [], post: [] };
          setHumanActions(ha);
          onDocumentGenerated?.({ taskId: id, fileName: `task-${id}.docx` });
          setPhase("result");
        } else if (data.status === "failed") {
          setError(t("ui.docfilling.errFailed"));
          setPhase("result");
        } else {
          pollTimer.current = setTimeout(() => pollStatus(id), POLL_INTERVAL);
        }
      } catch {
        pollTimer.current = setTimeout(() => pollStatus(id), POLL_INTERVAL);
      }
    },
    [serviceUrl, headers, onDocumentGenerated],
  );

  async function doGenerate(extraFields?: Record<string, string>) {
    if (!selectedBinding) return;
    setError(null);

    const fields: Record<string, string> = { ...prefillFields, ...editableFields, ...(extraFields ?? {}) };
    const selectedDocs = availableDocuments.filter((d) => selectedDocIds.has(d.id));

    const res = await fetch(`${serviceUrl}/api/inter/generate`, {
      method: "POST",
      headers: { ...(headers as Record<string, string>), "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: selectedBinding.template_id,
        fields,
        sourceDocuments: selectedDocs.map((d) => ({
          name: d.name,
          url: d.url,
          contentType: d.contentType,
        })),
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        apiErrorMessage(
          t,
          { status: res.status, message: typeof err?.error === "string" ? err.error : err?.error?.message },
          t("ui.docfilling.errFailed"),
        ),
      );
    }

    const { data } = await res.json();
    setTaskId(data.taskId);
    setTaskStatus("pending");
    pollCount.current = 0;
    setPhase("generating");
    pollTimer.current = setTimeout(() => pollStatus(data.taskId), POLL_INTERVAL);
  }

  async function handleAfterFields() {
    if (!selectedBinding) return;

    // Fetch pre-actions from template
    setPreActionsLoading(true);
    try {
      const res = await fetch(
        `${serviceUrl}/api/inter/templates/${selectedBinding.template_id}/actions`,
        { headers },
      );
      if (res.ok) {
        const data = await res.json();
        const ha: HumanActions = {
          init: data.init ?? [],
          pre: data.pre ?? [],
          post: data.post ?? [],
        };
        setHumanActions(ha);

        // Decide next phase
        if (availableDocuments.length > 0) {
          setPhase("sourceDocuments");
        } else if (ha.pre.length > 0) {
          setPhase("preActions");
        } else {
          await doGenerate();
        }
      } else {
        // If actions endpoint fails, proceed without pre-actions
        if (availableDocuments.length > 0) {
          setPhase("sourceDocuments");
        } else {
          await doGenerate();
        }
      }
    } catch {
      if (availableDocuments.length > 0) {
        setPhase("sourceDocuments");
      } else {
        await doGenerate();
      }
    } finally {
      setPreActionsLoading(false);
    }
  }

  async function handleAfterSourceDocs() {
    if (humanActions.pre.length > 0) {
      setPhase("preActions");
    } else {
      await doGenerate();
    }
  }

  async function handlePreActionsConfirm() {
    onActionsCompleted?.("pre", [...preActionsChecked].map((i) => humanActions.pre[i]));
    await doGenerate();
  }

  async function handleRegenerate(completedFields: Record<string, string>) {
    setRegenerating(true);
    try {
      await doGenerate(completedFields);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("ui.docfilling.errRegenerate"));
      setRegenerating(false);
    }
  }

  function handleResultAccept() {
    if (humanActions.post.length > 0) {
      setPhase("postActions");
    } else {
      handleClose();
    }
  }

  function handlePostActionsDone() {
    onActionsCompleted?.("post", [...postActionsChecked].map((i) => humanActions.post[i]));
    handleClose();
  }

  function handleClose() {
    stopPolling();
    onClose();
  }

  // Build visible phases for step indicator (skip phases with no content)
  const visiblePhases = PHASE_LABELS.filter(({ phase: p }) => {
    if (p === "sourceDocuments" && availableDocuments.length === 0) return false;
    if (p === "preActions" && humanActions.pre.length === 0) return false;
    if (p === "postActions" && humanActions.post.length === 0) return false;
    if (p === "select" && templateId != null) return false;
    return true;
  });

  const currentPhaseIdx = visiblePhases.findIndex(({ phase: p }) => p === phase);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" />
            {t("ui.docfilling.modalTitle")}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        {visiblePhases.length > 1 && (
          <div className="flex items-center justify-center gap-2 py-2 flex-wrap">
            {visiblePhases.map(({ phase: p, labelKey }, i) => (
              <React.Fragment key={p}>
                <StepDot
                  label={t(labelKey)}
                  active={phase === p}
                  done={currentPhaseIdx > i}
                />
                {i < visiblePhases.length - 1 && (
                  <div className="h-px w-6 bg-gray-200 flex-shrink-0" />
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 flex items-center gap-2">
            <X className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="mt-2">
          {phase === "select" && (
            <PhaseSelect
              bindings={bindings}
              loading={loadingBindings}
              onSelect={(b) => {
                setSelectedBinding(b);
                setPhase("fields");
              }}
            />
          )}

          {phase === "fields" && selectedBinding && (
            <PhaseFields
              binding={selectedBinding}
              prefillFields={prefillFields}
              editableFields={editableFields}
              onFieldChange={(k, v) => setEditableFields((prev) => ({ ...prev, [k]: v }))}
              onNext={handleAfterFields}
              nextLabel={preActionsLoading ? t("ui.docfilling.loading") : t("ui.docfilling.next")}
              generating={preActionsLoading}
            />
          )}

          {phase === "sourceDocuments" && (
            <PhaseSourceDocuments
              documents={availableDocuments}
              selected={selectedDocIds}
              onToggle={(id) =>
                setSelectedDocIds((prev) => {
                  const next = new Set(prev);
                  next.has(id) ? next.delete(id) : next.add(id);
                  return next;
                })
              }
              onNext={handleAfterSourceDocs}
              onSkip={handleAfterSourceDocs}
            />
          )}

          {phase === "preActions" && (
            <PhaseActions
              phase="pre"
              actions={humanActions.pre}
              checked={preActionsChecked}
              onToggle={(i) =>
                setPreActionsChecked((prev) => {
                  const next = new Set(prev);
                  next.has(i) ? next.delete(i) : next.add(i);
                  return next;
                })
              }
              onConfirm={handlePreActionsConfirm}
              confirmLabel={t("ui.docfilling.modalTitle")}
              confirmDisabled={preActionsChecked.size < humanActions.pre.length}
            />
          )}

          {phase === "generating" && <PhaseGenerating status={taskStatus} />}

          {phase === "result" && taskId !== null && (
            <PhaseResult
              taskId={taskId}
              documentUrl={documentUrl}
              incompleteFields={incompleteFields}
              onRegenerate={handleRegenerate}
              onAccept={handleResultAccept}
              regenerating={regenerating}
            />
          )}

          {phase === "postActions" && (
            <PhaseActions
              phase="post"
              actions={humanActions.post}
              checked={postActionsChecked}
              onToggle={(i) =>
                setPostActionsChecked((prev) => {
                  const next = new Set(prev);
                  next.has(i) ? next.delete(i) : next.add(i);
                  return next;
                })
              }
              onConfirm={handlePostActionsDone}
              confirmLabel={t("ui.docfilling.close")}
              confirmDisabled={false}
              downloadUrl={documentUrl}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
