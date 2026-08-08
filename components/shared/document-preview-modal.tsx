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
import { Markdown } from "./markdown";

/**
 * Familias que el visor sabe pintar dentro del navegador, sin conversión
 * server-side ni dependencias pesadas:
 *   - `pdf`   → visor nativo en `<iframe>`.
 *   - `image` → `<img>`.
 *   - `audio`/`video` → reproductores nativos `<audio>`/`<video>`.
 *   - `html`  → `<iframe sandbox>` (aislado: sin scripts ni acceso a la app).
 *   - `text`  → `<iframe>` sobre la URL inline (texto plano, código, JSON, XML…).
 *   - `markdown` → se descarga el texto y se renderiza con `marked`.
 *   - `csv`   → se descarga el texto y se pinta como tabla.
 * El resto cae al fallback de descarga.
 */
export type PreviewKind =
  | "pdf"
  | "image"
  | "audio"
  | "video"
  | "html"
  | "markdown"
  | "csv"
  | "text";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "ico"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "ogg", "oga", "m4a", "aac", "flac"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "ogv", "mov", "m4v"]);
// Texto plano previsualizable por extensión cuando el mime llega genérico
// (p.ej. `application/octet-stream`, habitual en ficheros de código).
const TEXT_EXTS = new Set([
  "txt", "log", "json", "xml", "yaml", "yml", "js", "jsx", "ts", "tsx",
  "css", "scss", "sql", "sh", "bash", "ini", "conf", "toml", "env",
]);

function extOf(name?: string | null): string {
  if (!name) return "";
  const m = /\.([a-z0-9]+)$/i.exec(name.trim());
  return m ? m[1].toLowerCase() : "";
}

/**
 * Clasifica el fichero por mime (prioritario) y, como respaldo, por extensión
 * —el mime almacenado suele venir genérico para texto/código—. Devuelve `null`
 * si no hay renderizador nativo (docx, xlsx… → descarga).
 */
export function previewKind(mimeType?: string | null, name?: string | null): PreviewKind | null {
  const mt = (mimeType ?? "").toLowerCase();
  const ext = extOf(name);
  if (mt === "application/pdf" || ext === "pdf") return "pdf";
  if (mt.startsWith("image/") || IMAGE_EXTS.has(ext)) return "image";
  if (mt.startsWith("audio/") || AUDIO_EXTS.has(ext)) return "audio";
  if (mt.startsWith("video/") || VIDEO_EXTS.has(ext)) return "video";
  if (mt === "text/html" || ext === "html" || ext === "htm") return "html";
  if (mt === "text/markdown" || ext === "md" || ext === "markdown") return "markdown";
  if (mt === "text/csv" || ext === "csv") return "csv";
  if (
    mt.startsWith("text/") ||
    mt === "application/json" ||
    mt === "application/xml" ||
    mt === "application/javascript" ||
    mt === "application/x-yaml" ||
    TEXT_EXTS.has(ext)
  ) {
    return "text";
  }
  return null;
}

/** ¿Hay renderizador nativo para este fichero? */
export function isPreviewable(mimeType?: string | null, name?: string | null): boolean {
  return previewKind(mimeType, name) !== null;
}

/** Tope de caracteres que se descargan para previsualizar markdown/CSV. */
const MAX_TEXT_PREVIEW = 500_000;
/** Tope de filas de CSV que se pintan (evita tablas de miles de filas). */
const MAX_CSV_ROWS = 500;

/** Delimitador más probable de la primera línea (soporta `,`, `;` y tab). */
function detectDelimiter(sample: string): string {
  const line = sample.split(/\r?\n/, 1)[0] ?? "";
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch] += 1;
  }
  return [";", "\t", ","].reduce((best, d) => (counts[d] > counts[best] ? d : best), ",");
}

/** Parser CSV mínimo con comillas y comillas escapadas (`""`). */
function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
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
 * signed URL `inline` ya resuelta por el consumidor y la renderiza según su tipo
 * (ver `previewKind`): PDF/imagen/audio/vídeo/HTML/texto directos, y
 * markdown/CSV descargando el texto. Con `nodeId`, añade "Resumir con IA"
 * (panel lateral).
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
  const kind = previewKind(mimeType, name);

  // Markdown y CSV se descargan como texto para transformarlos (render / tabla).
  // El resto de familias se pintan apuntando el elemento a la URL inline, sin
  // fetch — así el texto plano/HTML/audio/vídeo no dependen de CORS del bucket.
  const needsText = kind === "markdown" || kind === "csv";
  const [text, setText] = React.useState<string | null>(null);
  const [textLoading, setTextLoading] = React.useState(false);
  const [textError, setTextError] = React.useState(false);
  const [truncated, setTruncated] = React.useState(false);

  React.useEffect(() => {
    if (!open || !url || !needsText) {
      setText(null);
      setTextError(false);
      setTruncated(false);
      return;
    }
    let cancelled = false;
    setTextLoading(true);
    setTextError(false);
    setTruncated(false);
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.text();
      })
      .then((body) => {
        if (cancelled) return;
        setTruncated(body.length > MAX_TEXT_PREVIEW);
        setText(body.slice(0, MAX_TEXT_PREVIEW));
      })
      .catch(() => {
        if (!cancelled) setTextError(true);
      })
      .finally(() => {
        if (!cancelled) setTextLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, url, needsText]);

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

  const fallback = (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-gray-600">
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
  );

  const truncatedBanner = truncated ? (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-800">
      {t("ui.documentPreview.truncated")}
    </div>
  ) : null;

  function renderPreview() {
    if (!url) return null;
    switch (kind) {
      case "pdf":
        return <iframe src={url} title={name} className="h-full w-full border-0" />;
      case "image":
        // eslint-disable-next-line @next/next/no-img-element
        return <img src={url} alt={name} className="max-h-full max-w-full object-contain" />;
      case "audio":
        return (
          <audio controls src={url} className="w-full max-w-xl px-6">
            <track kind="captions" />
          </audio>
        );
      case "video":
        return (
          <video controls src={url} className="max-h-full max-w-full">
            <track kind="captions" />
          </video>
        );
      case "html":
        // Aislado: sin `allow-scripts` ni `allow-same-origin`, el documento no
        // puede ejecutar JS ni tocar la app (además va servido desde otro origen).
        return <iframe src={url} title={name} sandbox="" className="h-full w-full border-0 bg-white" />;
      case "text":
        // Texto plano / código: el navegador lo renderiza inline sin necesidad de
        // fetch (cero dependencia de CORS del bucket).
        return <iframe src={url} title={name} className="h-full w-full border-0 bg-white" />;
      case "markdown":
      case "csv": {
        if (textLoading) {
          return (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-6 w-6 animate-spin" />
              {t("ui.documentPreview.loading")}
            </div>
          );
        }
        // Si el fetch falla (p.ej. CORS del bucket) caemos al iframe inline como
        // último recurso; si tampoco, al fallback de descarga.
        if (textError || text == null) {
          return <iframe src={url} title={name} className="h-full w-full border-0 bg-white" />;
        }
        if (kind === "markdown") {
          return (
            <div className="flex h-full w-full flex-col overflow-hidden bg-white">
              {truncatedBanner}
              <Markdown className="prose prose-sm max-w-none flex-1 overflow-auto p-4 text-gray-800">
                {text}
              </Markdown>
            </div>
          );
        }
        // CSV → tabla.
        const delimiter = detectDelimiter(text);
        const allRows = parseCsv(text, delimiter);
        const rows = allRows.slice(0, MAX_CSV_ROWS);
        const overRowLimit = allRows.length > MAX_CSV_ROWS;
        if (rows.length === 0) return fallback;
        const [header, ...body] = rows;
        return (
          <div className="flex h-full w-full flex-col overflow-hidden bg-white">
            {(truncated || overRowLimit) && (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-800">
                {t("ui.documentPreview.truncated")}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-gray-100">
                  <tr>
                    {header.map((cell, i) => (
                      <th
                        key={i}
                        className="border border-gray-200 px-2 py-1 font-semibold text-gray-700"
                      >
                        {cell}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((r, ri) => (
                    <tr key={ri} className="even:bg-gray-50">
                      {header.map((_, ci) => (
                        <td key={ci} className="border border-gray-200 px-2 py-1 text-gray-800">
                          {r[ci] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      }
      default:
        return fallback;
    }
  }

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
          <div
            className={`flex min-h-0 flex-1 overflow-hidden rounded-md bg-gray-100 ${
              needsText || kind === "text" ? "" : "items-center justify-center"
            }`}
          >
            {loading ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-6 w-6 animate-spin" />
                {t("ui.documentPreview.loading")}
              </div>
            ) : error ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-red-600">
                <FileWarning className="h-6 w-6" />
                {error}
              </div>
            ) : !url ? null : (
              renderPreview()
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
