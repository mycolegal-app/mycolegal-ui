"use client";

import * as React from "react";
import { Download, FileWarning, Library, Loader2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { useI18n } from "../i18n/i18n-context";

/**
 * ¿Se puede previsualizar este tipo en el navegador? PDFs (visor nativo) e
 * imágenes. El resto cae al fallback de descarga.
 */
export function isPreviewable(mimeType?: string | null): boolean {
  if (!mimeType) return false;
  return mimeType === "application/pdf" || mimeType.startsWith("image/");
}

export interface DocumentPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * URL firmada con `Content-Disposition: inline` para que el navegador la
   * renderice en lugar de descargarla. `null` mientras el consumidor la
   * resuelve (combínalo con `loading`).
   */
  url: string | null;
  /** Nombre de fichero mostrado en la cabecera. */
  name: string;
  mimeType?: string | null;
  /** Spinner mientras el consumidor resuelve la signed URL. */
  loading?: boolean;
  /** Mensaje de error a mostrar en lugar del documento. */
  error?: string | null;
  /** Si se pasa, muestra un botón de descarga en la cabecera y el fallback. */
  onDownload?: () => void;
  /**
   * `DriveNode.id` del fichero. Si se pasa, habilita "Resumir con IA"
   * (POST /api/unidad/resumir → extrae texto + resume vía Consultor; cobra 1
   * crédito, editable en Admin). Ver PLAN_TECNICO_MYCOBOT_TOOLS.md §5.1.
   */
  nodeId?: string;
  /**
   * Si `true` (y hay `nodeId`), muestra "Incorporar al corpus" — añade el fichero
   * al corpus PRIVADO de la org (POST /api/unidad/incorporar-corpus → Consultor).
   * El explorador lo activa solo para ficheros de la Biblioteca particular (carpeta
   * writable de aportaciones).
   */
  canIncorporate?: boolean;
}

/**
 * Modal de vista previa de documentos reutilizable entre apps. Recibe una
 * signed URL `inline` ya resuelta por el consumidor y la renderiza (PDF→iframe,
 * imagen→img). Con `nodeId`, añade "Resumir con IA" (panel lateral).
 */
export function DocumentPreviewModal({
  open,
  onOpenChange,
  url,
  name,
  mimeType,
  loading,
  error,
  onDownload,
  nodeId,
  canIncorporate,
}: DocumentPreviewModalProps) {
  const { t } = useI18n();
  const isImage = !!mimeType && mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  const [summary, setSummary] = React.useState<string | null>(null);
  const [summarizing, setSummarizing] = React.useState(false);
  const [summaryError, setSummaryError] = React.useState<string | null>(null);

  // Reset del resumen al cambiar de documento o cerrar.
  React.useEffect(() => {
    setSummary(null);
    setSummaryError(null);
    setSummarizing(false);
  }, [nodeId, open]);

  async function handleSummarize() {
    if (!nodeId) return;
    setSummarizing(true);
    setSummaryError(null);
    try {
      const res = await fetch("/api/unidad/resumir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = json?.error?.code;
        setSummaryError(
          code === "NO_CREDITS"
            ? t("ui.documentPreview.summaryNoCredits")
            : code === "NEEDS_OCR"
              ? t("ui.documentPreview.summaryNeedsOcr")
              : (json?.error?.message ?? t("ui.documentPreview.summaryError")),
        );
        return;
      }
      setSummary(json?.data?.resumen ?? "");
    } catch {
      setSummaryError(t("ui.documentPreview.summaryError"));
    } finally {
      setSummarizing(false);
    }
  }

  const [incorporating, setIncorporating] = React.useState(false);
  const [incorporateMsg, setIncorporateMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  React.useEffect(() => {
    setIncorporating(false);
    setIncorporateMsg(null);
  }, [nodeId, open]);

  async function handleIncorporate() {
    if (!nodeId) return;
    setIncorporating(true);
    setIncorporateMsg(null);
    try {
      const res = await fetch("/api/unidad/incorporar-corpus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId }),
      });
      const json = await res.json().catch(() => ({}));
      setIncorporateMsg(
        res.ok
          ? { ok: true, text: t("ui.documentPreview.incorporateOk") }
          : { ok: false, text: json?.error?.message ?? t("ui.documentPreview.incorporateError") },
      );
    } catch {
      setIncorporateMsg({ ok: false, text: t("ui.documentPreview.incorporateError") });
    } finally {
      setIncorporating(false);
    }
  }

  const showPanel = !!nodeId && (summarizing || summary != null || summaryError != null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-w-5xl flex-col gap-3 p-4">
        <DialogHeader className="flex flex-row items-center justify-between gap-3 pr-8">
          <DialogTitle className="truncate text-base">
            {name || t("ui.documentPreview.title")}
          </DialogTitle>
          <div className="flex shrink-0 items-center gap-2">
            {nodeId && (
              <button
                type="button"
                onClick={handleSummarize}
                disabled={summarizing}
                className="inline-flex items-center gap-1.5 rounded-md border border-mc-primary-300 bg-mc-primary-50 px-2.5 py-1 text-xs font-medium text-mc-primary-800 hover:bg-mc-primary-100 disabled:opacity-50"
              >
                {summarizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {summarizing ? t("ui.documentPreview.summarizing") : t("ui.documentPreview.summarize")}
              </button>
            )}
            {nodeId && canIncorporate && (
              <button
                type="button"
                onClick={handleIncorporate}
                disabled={incorporating || incorporateMsg?.ok}
                title={incorporateMsg && !incorporateMsg.ok ? incorporateMsg.text : undefined}
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
              >
                {incorporating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Library className="h-3.5 w-3.5" />}
                {incorporating
                  ? t("ui.documentPreview.incorporating")
                  : incorporateMsg?.ok
                    ? t("ui.documentPreview.incorporateOk")
                    : t("ui.documentPreview.incorporate")}
              </button>
            )}
            {onDownload && (
              <button
                type="button"
                onClick={onDownload}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                <Download className="h-3.5 w-3.5" />
                {t("ui.documentPreview.download")}
              </button>
            )}
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 gap-3">
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md bg-gray-100">
            {loading ? (
              <div className="flex flex-col items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-6 w-6 animate-spin" />
                {t("ui.documentPreview.loading")}
              </div>
            ) : error ? (
              <div className="flex flex-col items-center gap-2 px-6 text-center text-sm text-red-600">
                <FileWarning className="h-6 w-6" />
                {error}
              </div>
            ) : !url ? null : isPdf ? (
              <iframe src={url} title={name} className="h-full w-full border-0" />
            ) : isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={name} className="max-h-full max-w-full object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-3 px-6 text-center text-sm text-gray-600">
                <FileWarning className="h-6 w-6 text-gray-400" />
                {t("ui.documentPreview.notPreviewable")}
                {onDownload && (
                  <button
                    type="button"
                    onClick={onDownload}
                    className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {t("ui.documentPreview.download")}
                  </button>
                )}
              </div>
            )}
          </div>

          {showPanel && (
            <div className="flex w-96 shrink-0 flex-col overflow-hidden rounded-md border border-gray-200 bg-white">
              <div className="flex items-center gap-1.5 border-b border-gray-100 px-3 py-2 text-xs font-semibold text-mc-primary-800">
                <Sparkles className="h-3.5 w-3.5" />
                {t("ui.documentPreview.summaryTitle")}
              </div>
              <div className="min-h-0 flex-1 overflow-auto px-3 py-2 text-sm text-gray-700">
                {summarizing ? (
                  <div className="flex items-center gap-2 text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("ui.documentPreview.summarizing")}
                  </div>
                ) : summaryError ? (
                  <div className="text-red-600">{summaryError}</div>
                ) : (
                  <div className="whitespace-pre-wrap">{summary}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
