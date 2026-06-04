"use client";

import * as React from "react";
import { Download, FileWarning, Loader2 } from "lucide-react";
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
}

/**
 * Modal de vista previa de documentos reutilizable entre apps. Recibe una
 * signed URL `inline` ya resuelta por el consumidor (cada app firma sus URLs
 * contra su propio bucket) y la renderiza:
 *   - application/pdf → <iframe> (visor nativo del navegador)
 *   - image/*        → <img>
 *   - resto          → fallback con descarga
 *
 * El cross-origin a storage.googleapis.com funciona porque es una navegación
 * dentro del iframe (no un fetch), así que no requiere CORS.
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
}: DocumentPreviewModalProps) {
  const { t } = useI18n();
  const isImage = !!mimeType && mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-w-5xl flex-col gap-3 p-4">
        <DialogHeader className="flex flex-row items-center justify-between gap-3 pr-8">
          <DialogTitle className="truncate text-base">
            {name || t("ui.documentPreview.title")}
          </DialogTitle>
          {onDownload && (
            <button
              type="button"
              onClick={onDownload}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <Download className="h-3.5 w-3.5" />
              {t("ui.documentPreview.download")}
            </button>
          )}
        </DialogHeader>

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
      </DialogContent>
    </Dialog>
  );
}
