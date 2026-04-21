"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bug, Camera, Send, Loader2, X } from "lucide-react";
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
  const [open, setOpen] = useState(false);
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

  const consoleErrors = useConsoleErrorCapture();

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
    setDescription("");
    setScreenshot(null);
    // Capture BEFORE opening the dialog so the overlay + modal don't end up
    // in the screenshot. captureScreenshot manages its own capturing state.
    await captureScreenshot();
    setOpen(true);
  }, [captureScreenshot]);

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
          description: description.trim(),
          pageUrl: window.location.href,
          screenshot,
          userAgent: navigator.userAgent,
          metadata: {
            viewport: { w: window.innerWidth, h: window.innerHeight },
            dpr: window.devicePixelRatio || 1,
            language: navigator.language,
            platform: (navigator as any).platform,
            consoleErrors,
            screenshotCaptureError: captureError,
            capturedAt: new Date().toISOString(),
          },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || body?.error || body?.message || `HTTP ${res.status}`);
      }
      setResult("ok");
      // Auto-close after short success flash
      setTimeout(() => setOpen(false), 1200);
    } catch (err: any) {
      setResult("error");
      setErrorMessage(err?.message || "No se pudo enviar la incidencia.");
    } finally {
      setSubmitting(false);
    }
  }, [appSlug, captureError, consoleErrors, description, screenshot, submitUrl]);

  const shortcutLabel = formatShortcut(shortcut);

  return (
    <>
      {visible && (
        <button
          type="button"
          onClick={openReporter}
          title={`Reportar incidencia — ${shortcutLabel} para ocultar este botón`}
          aria-label={`Reportar incidencia. Pulsa ${shortcutLabel} para ocultar este botón.`}
          className="fixed bottom-6 right-6 z-40 inline-flex h-10 w-10 items-center justify-center rounded-full bg-navy text-white shadow-lg ring-1 ring-white/40 transition-transform hover:scale-105 hover:bg-navy-800 focus:outline-none focus:ring-2 focus:ring-cyan print:hidden"
        >
          <Bug className="h-5 w-5" />
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Reportar una incidencia</DialogTitle>
            <DialogDescription>
              Describe qué estabas intentando hacer y qué ha pasado. Adjuntamos una captura
              de lo que ves ahora para ayudarnos a reproducirlo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Screenshot preview */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
              {capturing && (
                <div className="flex h-40 items-center justify-center text-sm text-gray-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Capturando pantalla…
                </div>
              )}
              {!capturing && screenshot && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={screenshot}
                  alt="Captura de pantalla"
                  className="max-h-60 w-full rounded-md object-contain"
                />
              )}
              {!capturing && !screenshot && (
                <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-gray-500">
                  <Camera className="h-5 w-5" />
                  <span>No se pudo capturar la pantalla — el reporte se enviará sin imagen.</span>
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
                    Reintentar
                  </button>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="incident-description" className="mb-1 block text-sm text-gray-700">
                Descripción
              </label>
              <Textarea
                id="incident-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Qué estabas haciendo cuando ocurrió, qué esperabas que pasara, y qué pasó realmente."
                rows={5}
                autoFocus
              />
            </div>

            <p className="text-xs text-gray-500">
              La captura incluye lo que estás viendo ahora. Si contiene datos sensibles,
              edita la descripción para indicarlo o cancela el envío.
            </p>

            {result === "ok" && (
              <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                Incidencia enviada. Gracias.
              </div>
            )}
            {result === "error" && (
              <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {errorMessage || "Error al enviar la incidencia."}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              <X className="mr-1 h-4 w-4" />
              Cancelar
            </Button>
            <Button onClick={submit} disabled={submitting || capturing || !description.trim()}>
              {submitting ? (
                <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Enviando…</>
              ) : (
                <><Send className="mr-1 h-4 w-4" />Enviar</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
