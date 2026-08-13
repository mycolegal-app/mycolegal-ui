"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  Send,
  CheckCircle2,
  RotateCcw,
  AlertCircle,
  Paperclip,
  Camera,
  Upload,
  Download,
  FileText,
  X as XIcon,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { useI18n } from "../i18n/i18n-context";
import {
  blobToCompressedJpeg,
  captureViewport,
  imageBlobFromPaste,
} from "../../lib/screenshot-utils";

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
  /** True cuando el mensaje lleva un JPEG adjunto persistido en BD. */
  hasScreenshot?: boolean;
  /**
   * Read-receipt: cuándo el reporter vio este mensaje de soporte. Solo
   * relevante en mensajes authorRole='superadmin'. NULL/undefined = aún
   * no leído. El lado soporte (viewerRole='superadmin') lo muestra como
   * "✓ Leído" / "Sin leer".
   */
  readByReporterAt?: string | null;
}

export interface IncidentThreadAttachment {
  id: string;
  messageId?: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  /** `user` | `superadmin` | `agent` — who uploaded it. */
  uploadedByRole: string;
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
  /**
   * Read-only view: hides the reply box and the close/reopen actions, so
   * the thread can be shown to someone who isn't the reporter (e.g. a
   * superadmin opening a teammate's incident from "Mi cuenta"). Their
   * support actions live in the admin panel, not here.
   */
  readOnly?: boolean;
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

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Reads a File into a base64 data URL (the backend strips the prefix). */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read-failed"));
    reader.readAsDataURL(file);
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
  readOnly = false,
}: IncidentThreadProps) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<IncidentThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  // #308/#309/#310 — confirmación visible tras enviar una respuesta (el usuario
  // no estaba seguro de si se guardaba, sobre todo al reabrir una cerrada).
  const [sentOk, setSentOk] = useState(false);
  const [reopenedNotice, setReopenedNotice] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeMode, setCloseMode] = useState(false);
  const [closeDraft, setCloseDraft] = useState("");
  const [reopening, setReopening] = useState(false);
  // Adjunto opcional para la respuesta (solo lo usa superadmin). Guardamos
  // el data URL ya comprimido a JPEG para mandarlo tal cual al POST.
  const [attachment, setAttachment] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [zoomedSrc, setZoomedSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Adjuntos-archivo (documentos arbitrarios en GCS), distintos del JPEG
  // inline de las respuestas. Lista + subida (solo soporte) + descarga.
  const [files, setFiles] = useState<IncidentThreadAttachment[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const docInputRef = useRef<HTMLInputElement>(null);
  // Subir archivos (a GCS) lo puede hacer soporte y también el reporter
  // (usuario) al responder; el guard `!readOnly` evita que un gestor que solo
  // observa el hilo de otro suba archivos.
  const canAttachFiles = viewerRole === "superadmin" || viewerRole === "user";
  // La captura/imagen INLINE de la respuesta solo se persiste para soporte (el
  // backend ignora el screenshot inline en mensajes de usuario), así que ese
  // control sigue siendo superadmin-only. El usuario adjunta imágenes como
  // archivo (sección de adjuntos), no inline.
  const canInlineScreenshot = viewerRole === "superadmin";

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

  // Tolerant: an older auth without the attachments endpoint just yields an
  // empty list rather than surfacing a thread-wide error.
  const fetchAttachments = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/attachments`, { credentials: "include" });
      if (!res.ok) return;
      const body = await res.json();
      setFiles(body.data || []);
    } catch {
      /* ignore — attachments are best-effort */
    }
  }, [apiBase]);

  useEffect(() => {
    fetchMessages();
    fetchAttachments();
    const id = setInterval(() => {
      fetchMessages();
      fetchAttachments();
    }, pollIntervalMs);
    return () => clearInterval(id);
  }, [fetchMessages, fetchAttachments, pollIntervalMs]);

  // #308/#309/#310 — la confirmación de "enviado" se autodescarta a los 6 s.
  useEffect(() => {
    if (!sentOk) return;
    const id = setTimeout(() => setSentOk(false), 6000);
    return () => clearTimeout(id);
  }, [sentOk]);

  const postReply = useCallback(async () => {
    const body = draft.trim();
    if (!body) return;
    const wasClosed = incident.status === "closed";
    setPosting(true);
    setError(null);
    setSentOk(false);
    try {
      const payload: { body: string; screenshot?: string } = { body };
      if (canInlineScreenshot && attachment) payload.screenshot = attachment;
      const res = await fetch(`${apiBase}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || body?.error || `HTTP ${res.status}`);
      }
      setDraft("");
      setAttachment(null);
      await fetchMessages();
      onRefresh?.();
      // #308/#309/#310 — confirmación explícita: el mensaje se guardó (y, si la
      // incidencia estaba cerrada, se ha reabierto). Se autodescarta.
      setSentOk(true);
      setReopenedNotice(wasClosed);
    } catch (err) {
      setError((err as Error).message || t("ui.incidentThread.errSend"));
    } finally {
      setPosting(false);
    }
  }, [apiBase, attachment, canInlineScreenshot, draft, fetchMessages, incident.status, onRefresh, t]);

  const ingestImageBlob = useCallback(
    async (blob: Blob) => {
      setAttaching(true);
      setError(null);
      try {
        const dataUrl = await blobToCompressedJpeg(blob);
        setAttachment(dataUrl);
      } catch (err) {
        setError((err as Error).message || t("ui.incidentThread.errAttach"));
      } finally {
        setAttaching(false);
      }
    },
    [t],
  );

  const captureScreen = useCallback(async () => {
    setAttaching(true);
    setError(null);
    try {
      const { dataUrl } = await captureViewport();
      setAttachment(dataUrl);
    } catch (err) {
      setError((err as Error).message || t("ui.incidentThread.errAttach"));
    } finally {
      setAttaching(false);
    }
  }, [t]);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (!canInlineScreenshot) return;
      const blob = imageBlobFromPaste(e.nativeEvent);
      if (!blob) return;
      e.preventDefault();
      void ingestImageBlob(blob);
    },
    [canInlineScreenshot, ingestImageBlob],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file) void ingestImageBlob(file);
    },
    [ingestImageBlob],
  );

  // Sube un documento arbitrario (PDF/XLSX/…) al hilo. Report-level
  // (sin messageId). Solo soporte. El backend acota a 5 MB.
  const uploadFile = useCallback(
    async (file: File) => {
      setUploadingFile(true);
      setError(null);
      try {
        const dataBase64 = await fileToDataUrl(file);
        const res = await fetch(`${apiBase}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            filename: file.name,
            mimeType: file.type || "application/octet-stream",
            dataBase64,
          }),
        });
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          throw new Error(b?.error?.message || b?.error || `HTTP ${res.status}`);
        }
        await fetchAttachments();
        onRefresh?.();
      } catch (err) {
        setError((err as Error).message || t("ui.incidentThread.errAttachFile"));
      } finally {
        setUploadingFile(false);
      }
    },
    [apiBase, fetchAttachments, onRefresh, t],
  );

  const handleDocChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file) void uploadFile(file);
    },
    [uploadFile],
  );

  const uploaderLabel = useCallback(
    (role: string): string =>
      role === "agent"
        ? t("ui.incidentThread.uploaderAgent")
        : role === "superadmin"
          ? t("ui.incidentThread.authorSupport")
          : t("ui.incidentThread.authorUser"),
    [t],
  );

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

      {readOnly && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{t("ui.incidentThread.readOnlyNotice")}</span>
        </div>
      )}

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
                {m.hasScreenshot && (
                  <button
                    type="button"
                    onClick={() => setZoomedSrc(`${apiBase}/messages/${m.id}/screenshot`)}
                    className={cn(
                      "mt-2 block overflow-hidden rounded border",
                      mine ? "border-white/30" : "border-gray-300",
                    )}
                    title={t("ui.incidentThread.viewAttachment")}
                  >
                    <img
                      src={`${apiBase}/messages/${m.id}/screenshot`}
                      alt={t("ui.incidentThread.attachmentAlt")}
                      className="max-h-48 w-auto"
                    />
                  </button>
                )}
                {/* Read-receipt: solo el lado soporte ve si el reporter
                    leyó su mensaje. Para el usuario no tiene sentido. */}
                {viewerRole === "superadmin" && m.authorRole === "superadmin" && (
                  <p className={cn("mt-1 text-[10px]", mine ? "text-white/60" : "text-gray-400")}>
                    {m.readByReporterAt
                      ? t("ui.incidentThread.readByReporterAt", { date: formatDateTime(m.readByReporterAt) })
                      : t("ui.incidentThread.notYetRead")}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Archivos adjuntos (documentos en GCS): distintos del JPEG inline.
          Visible para todos los que pueden leer el hilo; suben soporte y el
          propio reporter (no un gestor que solo observa). */}
      {(files.length > 0 || (canAttachFiles && !readOnly)) && (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
              <Paperclip className="h-3.5 w-3.5" />
              {t("ui.incidentThread.filesHeading")}
            </p>
            {canAttachFiles && !readOnly && (
              <>
                <input
                  ref={docInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleDocChange}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => docInputRef.current?.click()}
                  disabled={uploadingFile}
                  title={t("ui.incidentThread.attachFileHint")}
                >
                  {uploadingFile ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="mr-1 h-3.5 w-3.5" />
                  )}
                  {t("ui.incidentThread.attachFile")}
                </Button>
              </>
            )}
          </div>
          {files.length === 0 ? (
            <p className="text-xs text-gray-400">{t("ui.incidentThread.noFiles")}</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {files.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                    <div className="min-w-0">
                      <a
                        href={`${apiBase}/attachments/${f.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-sm font-medium text-cyan hover:underline"
                        title={f.filename}
                      >
                        {f.filename}
                      </a>
                      <p className="text-[11px] text-gray-400">
                        {formatBytes(f.sizeBytes)} · {uploaderLabel(f.uploadedByRole)} · {formatDateTime(f.createdAt)}
                      </p>
                    </div>
                  </div>
                  <a
                    href={`${apiBase}/attachments/${f.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {t("ui.incidentThread.downloadFile")}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {zoomedSrc && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setZoomedSrc(null)}
        >
          <button
            type="button"
            onClick={() => setZoomedSrc(null)}
            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label={t("ui.incidentThread.closeAttachment")}
          >
            <XIcon className="h-5 w-5" />
          </button>
          <img
            src={zoomedSrc}
            alt={t("ui.incidentThread.attachmentAlt")}
            className="max-h-full max-w-full"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* #308/#309/#310 — confirmación de que la respuesta se ha guardado. */}
      {sentOk && (
        <div className="flex items-start gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {reopenedNotice
              ? t("ui.incidentThread.replySentReopened")
              : t("ui.incidentThread.replySent")}
          </span>
        </div>
      )}

      {/* Actions. #233 — el reporter puede responder aunque esté cerrada; su
          respuesta la reabre (lo gestiona el backend). Soporte sí debe usar el
          botón Reabrir explícito. */}
      {!readOnly && !closeMode && (!isClosed || viewerRole === "user") && (
        <div className="space-y-2">
          {isClosed && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {t("ui.incidentThread.replyReopensHint")}
            </p>
          )}
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onPaste={handlePaste}
            rows={3}
            placeholder={
              viewerRole === "user"
                ? t("ui.incidentThread.replyToSupport")
                : t("ui.incidentThread.replyToUser")
            }
            disabled={posting}
          />
          {canInlineScreenshot && attachment && (
            <div className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 p-2">
              <img
                src={attachment}
                alt={t("ui.incidentThread.attachmentPreviewAlt")}
                className="h-16 w-auto rounded border"
              />
              <p className="flex-1 text-xs text-gray-600">
                {t("ui.incidentThread.attachmentReady")}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAttachment(null)}
                disabled={posting}
              >
                <XIcon className="mr-1 h-3.5 w-3.5" />
                {t("ui.incidentThread.removeAttachment")}
              </Button>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {canInlineScreenshot && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={posting || attaching}
                  title={t("ui.incidentThread.attachUploadHint")}
                >
                  <Upload className="mr-1 h-3.5 w-3.5" />
                  {t("ui.incidentThread.attachUpload")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={captureScreen}
                  disabled={posting || attaching}
                  title={t("ui.incidentThread.attachCaptureHint")}
                >
                  {attaching ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Camera className="mr-1 h-3.5 w-3.5" />
                  )}
                  {t("ui.incidentThread.attachCapture")}
                </Button>
                <span className="hidden text-xs text-gray-400 sm:inline-flex sm:items-center sm:gap-1">
                  <Paperclip className="h-3 w-3" />
                  {t("ui.incidentThread.attachPasteHint")}
                </span>
              </>
            )}
            {!isClosed && (
              <Button
                variant="outline"
                onClick={() => setCloseMode(true)}
                disabled={posting}
              >
                <CheckCircle2 className="mr-1 h-4 w-4" />
                {t("ui.incidentThread.btnClose")}
              </Button>
            )}
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

      {!readOnly && !isClosed && closeMode && (
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

      {/* Botón "Reabrir" bodyless SOLO para soporte: debe reabrir explícitamente
          antes de escribir. Para el USUARIO NO se muestra — reabre respondiendo (la
          caja de arriba, con su aviso, guarda el texto). Antes se mostraba a todos y
          el usuario clicaba aquí perdiendo su explicación de reapertura (#570). */}
      {!readOnly && isClosed && viewerRole !== "user" && (
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
