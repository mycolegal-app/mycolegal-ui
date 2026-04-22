"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Download, FileText, Loader2, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  // Callbacks
  onDocumentGenerated?: (doc: { taskId: number; fileName: string }) => void;
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

type Phase = "select" | "fields" | "generating" | "done";

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
const MAX_POLLS = 60; // 2.5s × 60 = 2.5 min max

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors",
          done && "border-green-500 bg-green-500 text-white",
          active && !done && "border-blue-600 bg-blue-600 text-white",
          !active && !done && "border-gray-300 bg-white text-gray-400",
        )}
      >
        {done ? <Check className="h-4 w-4" /> : null}
      </div>
      <span className={cn("text-xs", active ? "text-blue-600 font-medium" : "text-gray-400")}>
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 1 — Template selection
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
        No hay plantillas configuradas para este contexto. Configura bindings en mycolegal-docfilling.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-500 mb-4">Selecciona la plantilla para generar el documento:</p>
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
                {b.template?.name ?? `Plantilla #${b.template_id}`}
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
// Phase 2 — Field review
// ---------------------------------------------------------------------------

function PhaseFields({
  binding,
  prefillFields,
  editableFields,
  onFieldChange,
  onGenerate,
  generating,
}: {
  binding: Binding;
  prefillFields: Record<string, string>;
  editableFields: Record<string, string>;
  onFieldChange: (key: string, value: string) => void;
  onGenerate: () => void;
  generating: boolean;
}) {
  const mapping = binding.field_mapping;
  const allKeys = Object.keys(mapping);

  if (allKeys.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-500">Esta plantilla no requiere campos adicionales.</p>
        <Button onClick={onGenerate} disabled={generating} className="w-full">
          {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Generar documento
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Revisa y completa los campos para generar el documento:
      </p>
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
                    <Check className="h-3 w-3" /> Auto
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
                placeholder={isPrefilled ? "" : `Valor para ${dfField}`}
              />
              {sourceKey && (
                <p className="text-xs text-gray-400 mt-0.5 font-mono">{sourceKey}</p>
              )}
            </div>
          );
        })}
      </div>
      <Button onClick={onGenerate} disabled={generating} className="w-full mt-2">
        {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Generar documento
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 3 — Generating
// ---------------------------------------------------------------------------

function PhaseGenerating({ status }: { status: TaskStatus }) {
  const messages: Record<string, string> = {
    pending: "En cola…",
    processing: "Procesando con IA…",
  };

  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
      <p className="text-sm font-medium text-gray-700">
        {messages[status] ?? "Generando documento…"}
      </p>
      <p className="text-xs text-gray-400">
        Esto puede tardar unos segundos. No cierres la ventana.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 4 — Done
// ---------------------------------------------------------------------------

function PhaseDone({
  taskId,
  documentUrl,
  onClose,
}: {
  taskId: number;
  documentUrl?: string;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
        <Check className="h-7 w-7 text-green-600" />
      </div>
      <p className="text-base font-medium text-gray-900">Documento generado</p>
      <p className="text-xs text-gray-400">Tarea #{taskId}</p>
      <div className="flex gap-3">
        {documentUrl && (
          <a
            href={documentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Download className="h-4 w-4" />
            Descargar
          </a>
        )}
        <Button variant="outline" onClick={onClose}>
          Cerrar
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
  onDocumentGenerated,
}: DocFillingModalProps) {
  const [phase, setPhase] = useState<Phase>(templateId ? "fields" : "select");
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [loadingBindings, setLoadingBindings] = useState(false);
  const [selectedBinding, setSelectedBinding] = useState<Binding | null>(null);
  const [editableFields, setEditableFields] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [taskId, setTaskId] = useState<number | null>(null);
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("pending");
  const [documentUrl, setDocumentUrl] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const pollCount = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const headers = interHeaders(serviceKey, orgId, userToken);

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setPhase(templateId ? "fields" : "select");
      setSelectedBinding(null);
      setEditableFields({});
      setTaskId(null);
      setTaskStatus("pending");
      setDocumentUrl(undefined);
      setError(null);
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
      .catch(() => setError("No se pudieron cargar las plantillas"))
      .finally(() => setLoadingBindings(false));
  }, [open, phase, serviceUrl, appSlug, entityType, triggerState]);

  // If templateId pre-selected, create a synthetic binding for the fields phase
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
        setError("El documento tardó demasiado en generarse. Consulta el estado en la sección de tareas.");
        setPhase("done");
        return;
      }
      pollCount.current += 1;

      try {
        const res = await fetch(
          `${serviceUrl}/api/inter/status/${id}`,
          { headers },
        );
        if (!res.ok) throw new Error(`${res.status}`);
        const { data } = await res.json();
        setTaskStatus(data.status);

        if (data.status === "completed") {
          setDocumentUrl(data.documentUrl);
          setPhase("done");
          onDocumentGenerated?.({ taskId: id, fileName: `task-${id}.docx` });
        } else if (data.status === "failed") {
          setError("La generación del documento falló.");
          setPhase("done");
        } else {
          pollTimer.current = setTimeout(() => pollStatus(id), POLL_INTERVAL);
        }
      } catch {
        pollTimer.current = setTimeout(() => pollStatus(id), POLL_INTERVAL);
      }
    },
    [serviceUrl, headers, onDocumentGenerated],
  );

  async function handleGenerate() {
    if (!selectedBinding) return;
    setGenerating(true);
    setError(null);

    // Merge prefill + editable fields
    const fields: Record<string, string> = { ...prefillFields, ...editableFields };

    try {
      const res = await fetch(`${serviceUrl}/api/inter/generate`, {
        method: "POST",
        headers: { ...headers as Record<string, string>, "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedBinding.template_id,
          fields,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const { data } = await res.json();
      setTaskId(data.taskId);
      setTaskStatus("pending");
      setPhase("generating");
      pollCount.current = 0;
      pollTimer.current = setTimeout(() => pollStatus(data.taskId), POLL_INTERVAL);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al generar el documento");
    } finally {
      setGenerating(false);
    }
  }

  const phaseLabels: Phase[] = ["select", "fields", "generating", "done"];
  const phaseNames = ["Plantilla", "Campos", "Generando", "Resultado"];

  function handleClose() {
    stopPolling();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" />
            Generar documento
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        {templateId == null && (
          <div className="flex items-center justify-center gap-4 py-2">
            {phaseLabels.map((p, i) => (
              <React.Fragment key={p}>
                <StepDot
                  label={phaseNames[i]}
                  active={phase === p}
                  done={phaseLabels.indexOf(phase) > i}
                />
                {i < phaseLabels.length - 1 && (
                  <div className="h-px w-8 bg-gray-200 flex-shrink-0" />
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
              onGenerate={handleGenerate}
              generating={generating}
            />
          )}

          {phase === "generating" && <PhaseGenerating status={taskStatus} />}

          {phase === "done" && taskId !== null && (
            <PhaseDone taskId={taskId} documentUrl={documentUrl} onClose={handleClose} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
