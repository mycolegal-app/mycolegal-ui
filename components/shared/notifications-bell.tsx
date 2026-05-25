"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, Check, CheckCheck, Loader2, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { useI18n } from "../i18n/i18n-context";
import { apiErrorMessage } from "../../lib/api-error";

export interface NotificationEntry {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string;
  appSlug: string;
  relatedType: string | null;
  relatedId: string | null;
  readAt: string | null;
  createdAt: string;
  /** Absolute URL resolved from `apps.app_url` + `link` on the server. */
  absoluteLink: string;
}

interface ListResponse {
  data: NotificationEntry[];
  total: number;
  unread: number;
  limit: number;
  offset: number;
}

interface NotificationsBellProps {
  /** App slug the bell is mounted in. Used to decide internal vs cross-app nav. */
  currentAppSlug: string;
  /** Proxy base path. Defaults to each app's own `/api/notifications`. */
  apiBase?: string;
  /** Polling interval for the unread badge. Default 30s. */
  pollIntervalMs?: number;
  /**
   * Host router push for same-app deep links. If omitted, internal links
   * also resolve via `window.location.assign`.
   */
  onNavigateInternal?: (link: string) => void;
  /** Extra classes on the outer trigger button (colour overrides, etc.). */
  className?: string;
  /** Panel opening direction relative to the trigger. Default `right`. */
  align?: "left" | "right";
  /** Vertical anchor — pairs well with a footer-mounted bell. */
  verticalAlign?: "top" | "bottom";
  /** Colour scheme for the trigger icon. Default `dark` (white icon on navy). */
  variant?: "dark" | "light";
}

const DEFAULT_POLL = 30_000;

function formatRelative(
  iso: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return t("ui.notifications.relSeconds");
  const min = Math.floor(diffSec / 60);
  if (min < 60) return t("ui.notifications.relMinutes", { min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("ui.notifications.relHours", { hr });
  const d = Math.floor(hr / 24);
  if (d < 7) return t("ui.notifications.relDays", { d });
  return new Date(iso).toLocaleDateString();
}

/**
 * In-app notifications bell for the platform's sidebar. Polls an unread-count
 * endpoint while closed; fetches the full list when the user opens the
 * popover. Deep-links respect same-origin vs cross-app: same app → SPA
 * router push (if a handler is provided); different app → full navigation.
 *
 * The bell is deliberately agnostic of the host router — pass
 * `onNavigateInternal` to integrate with Next's router.
 */
export function NotificationsBell({
  currentAppSlug,
  apiBase = "/api/notifications",
  pollIntervalMs = DEFAULT_POLL,
  onNavigateInternal,
  className,
  align = "right",
  verticalAlign = "top",
  variant = "dark",
}: NotificationsBellProps) {
  const { t } = useI18n();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [detail, setDetail] = useState<NotificationEntry | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Poll just the cheap unread-count endpoint in the background. We keep
  // the list request gated on open so a user who never opens the bell only
  // pays the badge cost.
  const refreshUnread = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/unread-count`, { credentials: "include" });
      if (!res.ok) return;
      const body = await res.json();
      if (typeof body.unread === "number") setUnread(body.unread);
    } catch {
      // Silent — transient network noise shouldn't throw UI errors.
    }
  }, [apiBase]);

  useEffect(() => {
    refreshUnread();
    const id = setInterval(refreshUnread, pollIntervalMs);
    return () => clearInterval(id);
  }, [pollIntervalMs, refreshUnread]);

  // Re-check on focus so a returning tab doesn't lag behind.
  useEffect(() => {
    const onFocus = () => refreshUnread();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshUnread]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}?limit=20`, { credentials: "include" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          apiErrorMessage(t, { status: res.status, code: j?.error?.code, message: j?.error?.message }, t("ui.notifications.errLoad")),
        );
      }
      const body = (await res.json()) as ListResponse;
      setItems(body.data);
      setUnread(body.unread);
    } catch (err) {
      setError((err as Error).message || t("ui.notifications.errLoad"));
    } finally {
      setLoading(false);
    }
  }, [apiBase, t]);

  // Fetch on open; close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    fetchList();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDocClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDocClick);
    };
  }, [open, fetchList]);

  const markOneRead = useCallback(
    async (id: string) => {
      try {
        // Body `{}` necesario: los proxies de las apps consumer fwd Content-Type
        // application/json y Fastify (auth) rechaza body vacío con 400.
        const res = await fetch(`${apiBase}/${id}/read`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (!res.ok) return;
        setItems((prev) =>
          prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
        );
        setUnread((u) => Math.max(0, u - 1));
      } catch {
        /* ignore — next poll will correct the state */
      }
    },
    [apiBase],
  );

  const markAllRead = useCallback(async () => {
    setMarking(true);
    try {
      // Idéntico al PATCH individual: body `{}` para que el proxy + Fastify
      // no rechacen el POST por "Body cannot be empty when content-type is
      // application/json".
      const res = await fetch(`${apiBase}/read-all`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) return;
      const now = new Date().toISOString();
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? now })));
      setUnread(0);
    } finally {
      setMarking(false);
    }
  }, [apiBase]);

  const onEntryClick = useCallback(
    async (n: NotificationEntry) => {
      if (!n.readAt) {
        // Optimistic: flip la fila localmente y dispara el PATCH en bg.
        n = { ...n, readAt: new Date().toISOString() };
        void markOneRead(n.id);
      }
      // Cerramos el panel del sidebar y abrimos el modal centrado a
      // pantalla completa con el detalle.
      setOpen(false);
      setDetail(n);
    },
    [markOneRead],
  );

  const iconColour =
    variant === "dark"
      ? "text-gray-300 hover:text-white"
      : "text-gray-600 hover:text-gray-900";

  const panelSide = align === "right" ? "right-0" : "left-0";
  const panelVertical =
    verticalAlign === "bottom" ? "bottom-full mb-2" : "top-full mt-2";

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        aria-label={t("ui.notifications.title")}
        title={t("ui.notifications.title")}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "relative inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-cyan",
          iconColour,
          className,
        )}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span
            aria-label={t("ui.notifications.unreadAria", { count: String(unread) })}
            className="absolute -top-1 -right-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {/* Panel anclado al sidebar (lista). Comportamiento original. */}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={t("ui.notifications.title")}
          className={cn(
            "absolute z-50 w-80 max-w-[90vw] rounded-lg border border-gray-200 bg-white shadow-xl",
            panelSide,
            panelVertical,
          )}
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
            <span className="text-sm font-medium text-gray-900">{t("ui.notifications.title")}</span>
            <button
              type="button"
              onClick={markAllRead}
              disabled={marking || unread === 0}
              className="inline-flex items-center gap-1 text-xs text-cyan hover:underline disabled:opacity-50 disabled:no-underline"
            >
              {marking ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
              {t("ui.notifications.markAll")}
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && items.length === 0 && (
              <div className="flex items-center justify-center px-3 py-6 text-sm text-gray-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("ui.docfilling.loading")}
              </div>
            )}
            {!loading && error && (
              <div className="px-3 py-6 text-sm text-red-600">{error}</div>
            )}
            {!loading && !error && items.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-gray-500">
                {t("ui.notifications.empty")}
              </div>
            )}
            {items.map((n) => {
              const isRead = !!n.readAt;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onEntryClick(n)}
                  className={cn(
                    "flex w-full items-start gap-2 border-b border-gray-50 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-gray-50",
                    !isRead && "bg-cyan/5",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      isRead ? "bg-transparent" : "bg-cyan",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm text-gray-900", !isRead && "font-medium")}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{n.body}</p>
                    )}
                    <p className="mt-1 text-[11px] text-gray-400">
                      {formatRelative(n.createdAt, t)}
                      {n.appSlug !== currentAppSlug && (
                        <>
                          {" · "}
                          <span className="uppercase tracking-wide">{n.appSlug}</span>
                        </>
                      )}
                    </p>
                  </div>
                  {isRead && <Check className="mt-1 h-3 w-3 shrink-0 text-gray-300" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal centrado a pantalla completa: rendrizado vía portal a
          `document.body` para evitar que un ancestro con `transform` o
          `filter` (sidebar animado, etc.) cree un containing block que
          rompa `position: fixed` y nos lo deje pegado al sidebar.
          Detail-only — la lista sigue en el dropdown anclado de arriba. */}
      {detail && typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("ui.notifications.detailAria")}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setDetail(null);
            }}
          >
            <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">{detail.title}</p>
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    {formatRelative(detail.createdAt, t)}
                    {detail.appSlug !== currentAppSlug && (
                      <>
                        {" · "}
                        <span className="uppercase tracking-wide">{detail.appSlug}</span>
                      </>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={t("ui.docfilling.close")}
                  onClick={() => setDetail(null)}
                  className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3 text-sm text-gray-700">
                {detail.body ? (
                  <p className="whitespace-pre-wrap">{detail.body}</p>
                ) : (
                  <p className="text-gray-400">{t("ui.notifications.noDescription")}</p>
                )}
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setDetail(null)}
                  className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                >
                  {t("ui.docfilling.close")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
