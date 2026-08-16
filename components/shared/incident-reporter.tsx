"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bug, Camera, Send, Loader2, X, Paperclip, Upload, Minus, Maximize2, Lightbulb, ChevronLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { useI18n } from "../i18n/i18n-context";
import { apiErrorMessage } from "../../lib/api-error";

interface IncidentReporterProps {
  /** App slug sent with the report (e.g. "notaria", "legifirma"). */
  appSlug: string;
  /** POST endpoint for the report. Defaults to the app's own proxy route. */
  submitUrl?: string;
  /**
   * Keyboard shortcut that toggles the floating bug button's visibility
   * (defaults to Ctrl/Cmd+Shift+B). The dialog is only opened by clicking
   * the button itself — the shortcut is purely for show/hide.
   */
  shortcut?: { key: string; shift?: boolean; alt?: boolean };
}

const DEFAULT_SHORTCUT = { key: "B", shift: true };
const MAX_CONSOLE_ERRORS = 5;
const VISIBILITY_STORAGE_KEY = "mycolegal:incident-reporter:visible";
// Prefix for the persisted, not-yet-sent report text. Keyed by appSlug so a
// draft started in one app never bleeds into another. Persisting on every
// keystroke means a session expiry / redirect to /login mid-typing no longer
// loses the text — reopening the reporter rehydrates it.
const DRAFT_STORAGE_PREFIX = "mycolegal:incident-reporter:draft:";
// #162 — adjuntos que el usuario puede añadir al CREAR la incidencia. El
// backend (storeAttachment) corta a 5 MB por fichero; aquí validamos antes de
// subir para dar feedback inmediato. Tope de nº alineado con el schema de auth.
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/**
 * Naturaleza del reporte, elegida en el primer paso del reporter:
 * - "incident": algo falla / no funciona como debería.
 * - "improvement": propuesta de mejora / sugerencia.
 * El backend lo persiste en `IncidentReport.kind`; la pantalla es la misma,
 * solo cambia el lenguaje (y, en mejora, no adjuntamos los errores de consola).
 */
type ReportKind = "incident" | "improvement";

interface PendingAttachment {
  filename: string;
  mimeType: string;
  dataBase64: string;
  sizeBytes: number;
}

/** Reads a File into a base64 data URL (same shape the thread upload uses). */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatShortcut(s: { key: string; shift?: boolean; alt?: boolean }): string {
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const parts: string[] = [];
  parts.push(isMac ? "⌘" : "Ctrl");
  if (s.shift) parts.push(isMac ? "⇧" : "Shift");
  if (s.alt) parts.push(isMac ? "⌥" : "Alt");
  parts.push(s.key.toUpperCase());
  return parts.join(isMac ? "" : "+");
}

interface CapturedError {
  message: string;
  source?: string;
  at: string;
}

/** Ring buffer of recent `window.onerror` / `unhandledrejection` messages. */
function useConsoleErrorCapture(): CapturedError[] {
  const ref = useRef<CapturedError[]>([]);
  const [snap, setSnap] = useState<CapturedError[]>([]);

  useEffect(() => {
    const push = (err: CapturedError) => {
      ref.current = [...ref.current.slice(-(MAX_CONSOLE_ERRORS - 1)), err];
      setSnap(ref.current);
    };

    const onError = (e: ErrorEvent) => {
      push({
        message: e.message || String(e.error),
        source: e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : undefined,
        at: new Date().toISOString(),
      });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      push({
        message: e.reason?.message || String(e.reason),
        at: new Date().toISOString(),
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return snap;
}

/**
 * In-app incident reporter. Mount once at the app root. On Ctrl/Cmd+Shift+B
 * (or the floating bug button), takes a DOM screenshot, lets the user
 * describe the problem, and POSTs everything to `submitUrl` — which the app
 * is expected to proxy to mycolegal-auth's `POST /incidents`.
 */
export function IncidentReporter({
  appSlug,
  submitUrl = "/api/incidents",
  shortcut = DEFAULT_SHORTCUT,
}: IncidentReporterProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  // Naturaleza elegida en el primer paso. `null` = aún mostrando la elección
  // (incidencia vs propuesta de mejora); una vez elegida, se muestra el
  // formulario de siempre con el lenguaje adaptado.
  const [kind, setKind] = useState<ReportKind | null>(null);
  // #306 — el modal puede minimizarse a una barra para echar un vistazo a la
  // pantalla sin perder lo escrito. `minimizeRef` evita que el cierre del Dialog
  // (al ocultarse por minimizar) se interprete como cerrar del todo.
  const [minimized, setMinimized] = useState(false);
  const minimizeRef = useRef(false);
  const [capturing, setCapturing] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<null | "ok" | "error">(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [captureError, setCaptureError] = useState<string | null>(null);
  // The button is visible by default; the shortcut flips it, and the
  // preference is persisted to localStorage so it survives reloads.
  const [visible, setVisible] = useState(true);
  // #162 — user-provided attachments for the new incident.
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const consoleErrors = useConsoleErrorCapture();

  const addFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      setAttachError(null);
      const incoming = Array.from(fileList);
      const accepted: PendingAttachment[] = [];
      for (const file of incoming) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          setAttachError(t("ui.incidentReporter.attachTooBig", { name: file.name }));
          continue;
        }
        try {
          const dataBase64 = await fileToDataUrl(file);
          accepted.push({
            filename: file.name,
            mimeType: file.type || "application/octet-stream",
            dataBase64,
            sizeBytes: file.size,
          });
        } catch {
          setAttachError(t("ui.incidentReporter.attachReadError", { name: file.name }));
        }
      }
      setAttachments((prev) => {
        const room = MAX_ATTACHMENTS - prev.length;
        if (accepted.length > room) {
          setAttachError(t("ui.incidentReporter.attachTooMany", { max: MAX_ATTACHMENTS }));
        }
        return [...prev, ...accepted.slice(0, Math.max(0, room))];
      });
    },
    [t],
  );

  const removeAttachment = useCallback((idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const draftKey = `${DRAFT_STORAGE_PREFIX}${appSlug}`;

  // Persist the in-progress report text so it survives a session expiry,
  // redirect to /login, or accidental dialog close. Cleared only on a
  // successful send. localStorage may be blocked (private mode) — ignore.
  const updateDescription = useCallback(
    (text: string) => {
      setDescription(text);
      try {
        if (text) window.localStorage.setItem(draftKey, text);
        else window.localStorage.removeItem(draftKey);
      } catch {
        // localStorage unavailable — the draft just won't survive a reload.
      }
    },
    [draftKey],
  );

  const captureScreenshot = useCallback(async () => {
    setCapturing(true);
    setCaptureError(null);
    try {
      const mod = await import("html2canvas");
      const html2canvas = (mod.default || mod) as typeof import("html2canvas").default;
      const canvas = await html2canvas(document.body, {
        backgroundColor: null,
        logging: false,
        useCORS: true,
        // Cap scale so the resulting JPEG stays reasonable on 4K screens.
        scale: Math.min(window.devicePixelRatio || 1, 1.5),
        windowWidth: document.documentElement.clientWidth,
        windowHeight: document.documentElement.clientHeight,
      });
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      setScreenshot(dataUrl);
    } catch (err) {
      console.error("Screenshot capture failed", err);
      setScreenshot(null);
      // Preserve the failure reason so we can submit it as metadata. Without
      // this, silent failures look identical to "user clicked cancel" and
      // we have no way to diagnose why capture failed on a given page.
      const msg = (err as Error)?.message || String(err);
      setCaptureError(msg.slice(0, 500));
    } finally {
      setCapturing(false);
    }
  }, []);

  const openReporter = useCallback(async () => {
    setResult(null);
    setErrorMessage("");
    // Rehydrate any unsent draft (e.g. the previous attempt was interrupted by
    // a session expiry) instead of starting blank, so the user never loses
    // what they had already written.
    let draft = "";
    try {
      draft = window.localStorage.getItem(draftKey) ?? "";
    } catch {
      // localStorage blocked — start empty.
    }
    setDescription(draft);
    setScreenshot(null);
    setAttachments([]);
    setAttachError(null);
    // Cada apertura arranca en el paso de elección incidencia vs mejora.
    setKind(null);
    // Capture BEFORE opening the dialog so the overlay + modal don't end up
    // in the screenshot. captureScreenshot manages its own capturing state.
    await captureScreenshot();
    setMinimized(false);
    setOpen(true);
  }, [captureScreenshot, draftKey]);

  // #306 — cierre real del Dialog. Si el "cierre" viene de minimizar (Dialog se
  // oculta), lo ignoramos para no cerrar del todo ni perder lo escrito.
  const handleOpenChange = useCallback((v: boolean) => {
    if (!v && minimizeRef.current) {
      minimizeRef.current = false;
      return;
    }
    setOpen(v);
    if (!v) setMinimized(false);
  }, []);

  // Hydrate the persisted visibility once on mount. We default to visible
  // (so a fresh session still shows the bug) and only flip when a previous
  // session explicitly stored "false".
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VISIBILITY_STORAGE_KEY);
      if (stored === "false") setVisible(false);
    } catch {
      // localStorage may be blocked (private mode); ignore — default stands.
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const metaOrCtrl = e.metaKey || e.ctrlKey;
      const matchesKey = e.key.toUpperCase() === (shortcut.key || "B").toUpperCase();
      const matchesShift = shortcut.shift ? e.shiftKey : true;
      const matchesAlt = shortcut.alt ? e.altKey : true;
      if (metaOrCtrl && matchesShift && matchesAlt && matchesKey) {
        e.preventDefault();
        setVisible((v) => {
          const next = !v;
          try { window.localStorage.setItem(VISIBILITY_STORAGE_KEY, String(next)); } catch {}
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcut]);

  // Public imperative trigger: any component can do
  // `window.dispatchEvent(new CustomEvent("mycolegal:open-incident-reporter"))`
  // to open the modal (e.g. CTA en empty state de /incidencias).
  useEffect(() => {
    const handler = () => { void openReporter(); };
    window.addEventListener("mycolegal:open-incident-reporter", handler);
    return () => window.removeEventListener("mycolegal:open-incident-reporter", handler);
  }, [openReporter]);

  const submit = useCallback(async () => {
    if (!description.trim()) return;
    setSubmitting(true);
    setResult(null);
    setErrorMessage("");
    try {
      const res = await fetch(submitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appSlug,
          // Naturaleza elegida en el primer paso. Fallback defensivo a
          // "incident" (el backend también aplica ese default).
          kind: kind ?? "incident",
          description: description.trim(),
          pageUrl: window.location.href,
          screenshot,
          userAgent: navigator.userAgent,
          metadata: {
            viewport: { w: window.innerWidth, h: window.innerHeight },
            dpr: window.devicePixelRatio || 1,
            language: navigator.language,
            platform: (navigator as any).platform,
            // Los errores de consola solo aportan al diagnóstico de una
            // incidencia; en una propuesta de mejora no son relevantes.
            consoleErrors: kind === "improvement" ? [] : consoleErrors,
            screenshotCaptureError: captureError,
            capturedAt: new Date().toISOString(),
          },
          // #162 — adjuntos del usuario (sin sizeBytes, que es solo de UI).
          attachments: attachments.length
            ? attachments.map(({ filename, mimeType, dataBase64 }) => ({ filename, mimeType, dataBase64 }))
            : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message =
          body?.error?.message || (typeof body?.error === "string" ? body.error : undefined) || body?.message;
        throw new Error(
          apiErrorMessage(t, { status: res.status, code: body?.error?.code, message }, t("ui.incidentReporter.errSend")),
        );
      }
      setResult("ok");
      // Limpiar el estado en memoria además del draft persistido: si no, al
      // reabrir el reporter (creyendo que no se envió) el texto seguía ahí y
      // un segundo submit generaba un duplicado idéntico (#361/#362).
      setAttachments([]);
      setDescription("");
      setScreenshot(null);
      // Sent successfully — discard the persisted draft so the next open
      // starts blank.
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        // ignore
      }
      // Auto-close after short success flash
      setTimeout(() => setOpen(false), 1200);
    } catch (err: any) {
      setResult("error");
      setErrorMessage(err?.message || t("ui.incidentReporter.errSend"));
    } finally {
      setSubmitting(false);
    }
  }, [appSlug, attachments, captureError, consoleErrors, description, draftKey, kind, screenshot, submitUrl, t]);

  const shortcutLabel = formatShortcut(shortcut);

  // Textos adaptados a la naturaleza elegida. Misma pantalla, distinto
  // lenguaje: en propuesta de mejora usamos las claves `*Improvement`.
  const isImprovement = kind === "improvement";
  const headerTitle = isImprovement
    ? t("ui.incidentReporter.titleImprovement")
    : t("ui.incidentReporter.title");
  const headerDescription = isImprovement
    ? t("ui.incidentReporter.descriptionImprovement")
    : t("ui.incidentReporter.description");
  const descLabel = isImprovement
    ? t("ui.incidentReporter.descriptionLabelImprovement")
    : t("ui.incidentReporter.descriptionLabel");
  const descPlaceholder = isImprovement
    ? t("ui.incidentReporter.descriptionPlaceholderImprovement")
    : t("ui.incidentReporter.descriptionPlaceholder");
  const sendLabel = isImprovement
    ? t("ui.incidentReporter.btnSendImprovement")
    : t("ui.incidentReporter.btnSend");
  const sentOkLabel = isImprovement
    ? t("ui.incidentReporter.sentOkImprovement")
    : t("ui.incidentReporter.sentOk");
  const minimizedLabel = isImprovement
    ? t("ui.incidentReporter.minimizedLabelImprovement")
    : t("ui.incidentReporter.minimizedLabel");

  return (
    <>
      {visible && (
        <button
          type="button"
          onClick={openReporter}
          title={t("ui.incidentReporter.btnTooltip", { shortcut: shortcutLabel })}
          aria-label={t("ui.incidentReporter.btnAria", { shortcut: shortcutLabel })}
          className="fixed bottom-6 right-6 z-[60] inline-flex h-10 w-10 items-center justify-center rounded-full bg-navy text-white shadow-lg ring-1 ring-white/40 transition-transform hover:scale-105 hover:bg-navy-800 focus:outline-none focus:ring-2 focus:ring-cyan print:hidden"
        >
          <Bug className="h-5 w-5" />
        </button>
      )}

      {/* #306 — barra minimizada: deja ver la pantalla sin perder el borrador. */}
      {open && minimized && (
        <div className="fixed bottom-6 right-6 z-[60] flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg print:hidden">
          {isImprovement ? (
            <Lightbulb className="h-4 w-4 shrink-0 text-navy" />
          ) : (
            <Bug className="h-4 w-4 shrink-0 text-navy" />
          )}
          <span className="text-sm font-medium text-gray-800">
            {minimizedLabel}
          </span>
          <button
            type="button"
            onClick={() => setMinimized(false)}
            title={t("ui.incidentReporter.expand")}
            aria-label={t("ui.incidentReporter.expand")}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); setMinimized(false); }}
            title={t("ui.incidentThread.btnCancel")}
            aria-label={t("ui.incidentThread.btnCancel")}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <Dialog open={open && !minimized} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-2xl">
          {/* #306 — minimizar a una barra para echar un vistazo a la pantalla. */}
          <button
            type="button"
            onClick={() => { minimizeRef.current = true; setMinimized(true); }}
            title={t("ui.incidentReporter.minimize")}
            aria-label={t("ui.incidentReporter.minimize")}
            className="absolute right-12 top-4 rounded-sm p-0.5 text-gray-500 opacity-70 transition-opacity hover:bg-gray-100 hover:opacity-100 focus:outline-none"
          >
            <Minus className="h-4 w-4" />
          </button>
          <DialogHeader>
            <DialogTitle>
              {kind === null ? t("ui.incidentReporter.chooseTitle") : headerTitle}
            </DialogTitle>
            <DialogDescription>
              {kind === null ? t("ui.incidentReporter.chooseDescription") : headerDescription}
            </DialogDescription>
          </DialogHeader>

          {/* Paso 1 — elección incidencia vs propuesta de mejora. Misma
              pantalla a continuación, solo cambia el lenguaje. */}
          {kind === null && (
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setKind("incident")}
                className="flex flex-col items-start gap-2 rounded-lg border border-gray-200 bg-white p-4 text-left transition-colors hover:border-navy hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-cyan"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                  <Bug className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold text-gray-900">
                  {t("ui.incidentReporter.chooseIncident")}
                </span>
                <span className="text-xs text-gray-500">
                  {t("ui.incidentReporter.chooseIncidentHint")}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setKind("improvement")}
                className="flex flex-col items-start gap-2 rounded-lg border border-gray-200 bg-white p-4 text-left transition-colors hover:border-navy hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-cyan"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-cyan-100 text-cyan-700">
                  <Lightbulb className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold text-gray-900">
                  {t("ui.incidentReporter.chooseImprovement")}
                </span>
                <span className="text-xs text-gray-500">
                  {t("ui.incidentReporter.chooseImprovementHint")}
                </span>
              </button>
            </div>
          )}

          {kind !== null && (
          <div className="space-y-4">
            {/* Screenshot preview */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
              {capturing && (
                <div className="flex h-40 items-center justify-center text-sm text-gray-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("ui.incidentReporter.capturing")}
                </div>
              )}
              {!capturing && screenshot && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={screenshot}
                  alt={t("ui.incidentReporter.screenshotAlt")}
                  className="max-h-60 w-full rounded-md object-contain"
                />
              )}
              {!capturing && !screenshot && (
                <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-gray-500">
                  <Camera className="h-5 w-5" />
                  <span>{t("ui.incidentReporter.captureFailed")}</span>
                  {captureError && (
                    <span className="max-w-xs truncate text-[11px] text-gray-400" title={captureError}>
                      {captureError}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={captureScreenshot}
                    className="text-cyan hover:underline"
                  >
                    {t("ui.incidentReporter.retry")}
                  </button>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="incident-description" className="mb-1 block text-sm text-gray-700">
                {descLabel}
              </label>
              <Textarea
                id="incident-description"
                value={description}
                onChange={(e) => updateDescription(e.target.value)}
                placeholder={descPlaceholder}
                rows={5}
                // #429 — tope alineado con el backend (evita que el envío falle
                // silenciosamente por longitud; antes eran 4000 y truncaba).
                maxLength={20000}
                autoFocus
              />
            </div>

            {/* #162 — adjuntos aportados por el usuario (imágenes, PDF…). */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-sm text-gray-700">
                  {t("ui.incidentReporter.attachmentsLabel")}
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={attachments.length >= MAX_ATTACHMENTS}
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {t("ui.incidentReporter.attachBtn")}
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  void addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              {attachments.length === 0 ? (
                <p className="text-xs text-gray-400">{t("ui.incidentReporter.attachHint", { max: MAX_ATTACHMENTS })}</p>
              ) : (
                <ul className="space-y-1">
                  {attachments.map((a, idx) => (
                    <li
                      key={`${a.filename}-${idx}`}
                      className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs"
                    >
                      <span className="flex min-w-0 items-center gap-1.5 text-gray-700">
                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <span className="truncate">{a.filename}</span>
                        <span className="shrink-0 text-gray-400">
                          {a.sizeBytes < 1024 * 1024
                            ? `${(a.sizeBytes / 1024).toFixed(0)} KB`
                            : `${(a.sizeBytes / (1024 * 1024)).toFixed(1)} MB`}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(idx)}
                        aria-label={t("ui.incidentThread.btnCancel")}
                        className="ml-2 shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {attachError && <p className="mt-1 text-xs text-red-500">{attachError}</p>}
            </div>

            <p className="text-xs text-gray-500">
              {t("ui.incidentReporter.privacyHint")}
            </p>

            {result === "ok" && (
              <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                {sentOkLabel}
              </div>
            )}
            {result === "error" && (
              <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {errorMessage || t("ui.incidentReporter.errSendShort")}
              </div>
            )}
          </div>
          )}

          <DialogFooter>
            {kind !== null && (
              // Volver al paso de elección sin perder lo escrito.
              <Button
                variant="outline"
                onClick={() => { setKind(null); setResult(null); setErrorMessage(""); }}
                disabled={submitting}
                className="sm:mr-auto"
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                {t("ui.incidentReporter.btnBack")}
              </Button>
            )}
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              <X className="mr-1 h-4 w-4" />
              {t("ui.incidentThread.btnCancel")}
            </Button>
            {kind !== null && (
              <Button onClick={submit} disabled={submitting || capturing || !description.trim()}>
                {submitting ? (
                  <><Loader2 className="mr-1 h-4 w-4 animate-spin" />{t("ui.forgotPassword.sending")}</>
                ) : (
                  <><Send className="mr-1 h-4 w-4" />{sendLabel}</>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
