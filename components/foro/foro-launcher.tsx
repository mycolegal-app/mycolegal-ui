"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  BellOff,
  Flag,
  Lock,
  MessageSquarePlus,
  MessageSquareX,
  MessagesSquare,
  Send,
  X,
} from "lucide-react";
import { useI18n } from "../i18n";

const GOLD = "#b09a6e";

interface Topic {
  id: string;
  title: string;
  icon: string | null;
  isReadOnly: boolean;
  order: number;
  unread: number;
}
interface Message {
  id: string;
  topicId: string;
  source: string;
  authorName: string;
  authorUserId: string | null;
  text: string | null;
  replyToId: string | null;
  createdAt: string;
  editedAt: string | null;
  media: { id: string; mime: string; fileName: string | null }[];
}

async function getData<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = await r.json();
    return (j?.data ?? null) as T | null;
  } catch {
    return null;
  }
}
function initials(n: string): string {
  return n
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
function localeOf(language: string): string {
  return (
    ({ CAST: "es-ES", CAT: "ca-ES", VAL: "ca-ES", GAL: "gl-ES", EUS: "eu-ES" } as Record<string, string>)[
      language
    ] ?? "es-ES"
  );
}

/**
 * Lanzador cross-app del Foro: vive en mycolegal-ui, se pasa como
 * `userFooterExtra` del AppSidebar (gated por org_admin en cada app). Estados del
 * icono: no-vinculado (⊕•, abre diálogo de condiciones), vinculado (💬 + badge,
 * abre el drawer), silenciado (gris con X, sin poll). Todos los fetch a
 * `/api/foro/*` son relativos → funcionan en cualquier app vía su proxy.
 */
export function ForoLauncher() {
  const { t } = useI18n();
  const [linked, setLinked] = useState<boolean | null>(null);
  const [muted, setMuted] = useState(false);
  const [unread, setUnread] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/foro/link/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        setLinked(j?.data ? !!j.data.linked : false);
        setMuted(j?.data ? !!j.data.muted : false);
      })
      .catch(() => {
        if (alive) setLinked(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!linked || muted) {
      setUnread(0);
      return;
    }
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/foro/unread");
        if (!r.ok) return;
        const j = await r.json();
        if (alive) setUnread(j?.data?.unread ?? 0);
      } catch {
        /* noop */
      }
    };
    load();
    const id = setInterval(load, 45000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [linked, muted]);

  const toggleMute = useCallback(async () => {
    const next = !muted;
    const r = await fetch("/api/foro/mute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ muted: next }),
    });
    if (!r.ok) return;
    setMuted(next);
  }, [muted]);

  const acceptAndConnect = useCallback(async () => {
    setConnecting(true);
    try {
      const r = await fetch("/api/foro/link/token", { method: "POST" });
      const j = await r.json();
      if (j?.data?.deepLink) window.open(j.data.deepLink, "_blank", "noopener");
    } finally {
      setConnecting(false);
      setDialogOpen(false);
    }
  }, []);

  if (linked === null) return <div className="h-8 w-8" aria-hidden />;

  const TriggerIcon = !linked ? MessageSquarePlus : muted ? MessageSquareX : MessagesSquare;
  const triggerTitle = !linked
    ? t("ui.foro.notLinkedTooltip")
    : muted
      ? t("ui.foro.mutedTooltip")
      : t("ui.foro.title");

  return (
    <>
      <button
        type="button"
        onClick={() => (linked ? setDrawerOpen(true) : setDialogOpen(true))}
        title={triggerTitle}
        aria-label={triggerTitle}
        className={`relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/5 ${
          muted ? "text-gray-500" : "text-gray-400 hover:text-white"
        }`}
      >
        <TriggerIcon className="h-4 w-4" style={!linked ? { color: GOLD } : undefined} />
        {!linked && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full" style={{ backgroundColor: GOLD }} />
        )}
        {linked && !muted && unread > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[9px] font-semibold text-white"
            style={{ backgroundColor: GOLD }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {drawerOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <ForoDrawerPanel muted={muted} onToggleMute={toggleMute} onClose={() => setDrawerOpen(false)} />,
          document.body,
        )}

      {dialogOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setDialogOpen(false)}
          >
            <div
              className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-start justify-between gap-4">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {t("ui.foro.linkTitle")}
                </h2>
                <button
                  onClick={() => setDialogOpen(false)}
                  aria-label={t("ui.foro.linkCancel")}
                  className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="whitespace-pre-line text-sm text-gray-600 dark:text-gray-300">
                {t("ui.foro.linkConditions")}
              </p>
              <p className="mt-3 text-xs text-gray-400">{t("ui.foro.linkOpening")}</p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setDialogOpen(false)}
                  className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  {t("ui.foro.linkCancel")}
                </button>
                <button
                  onClick={acceptAndConnect}
                  disabled={connecting}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                  style={{ backgroundColor: GOLD }}
                >
                  {t("ui.foro.linkAccept")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/** Panel deslizante (drawer) con topics + hilo + SSE en vivo. */
function ForoDrawerPanel({
  muted,
  onToggleMute,
  onClose,
}: {
  muted: boolean;
  onToggleMute: () => void;
  onClose: () => void;
}) {
  const { t, language } = useI18n();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const timeFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(localeOf(language), {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [language],
  );

  useEffect(() => {
    getData<Topic[]>("/api/foro/topics").then((d) => {
      if (!d) return;
      setTopics(d);
      setActiveId((cur) => cur ?? d[0]?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (!activeId) return;
    let alive = true;
    getData<Message[]>(`/api/foro/messages?topicId=${activeId}`).then((m) => {
      if (alive && m) setMessages(m);
    });
    fetch("/api/foro/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicId: activeId }),
    }).then(() => setTopics((ts) => ts.map((x) => (x.id === activeId ? { ...x, unread: 0 } : x))));

    const es = new EventSource(`/api/foro/stream?topicId=${activeId}`);
    es.addEventListener("message", (e) => {
      try {
        const m = JSON.parse((e as MessageEvent).data) as Message;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      } catch {
        /* noop */
      }
    });
    return () => {
      alive = false;
      es.close();
    };
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !activeId || sending) return;
    setSending(true);
    try {
      const r = await fetch("/api/foro/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: activeId, text }),
      });
      if (r.ok) {
        const j = await r.json();
        const m = j?.data as Message | undefined;
        if (m) setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        setDraft("");
      }
    } finally {
      setSending(false);
    }
  }, [draft, activeId, sending]);

  const report = useCallback(
    async (id: string) => {
      const motivo = typeof window !== "undefined" ? window.prompt(t("ui.foro.reportPrompt")) : null;
      if (motivo == null) return;
      await fetch("/api/foro/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: id, motivo }),
      });
    },
    [t],
  );

  const active = topics.find((x) => x.id === activeId) ?? null;

  return (
    <div className="fixed inset-0 z-[110] flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <header className="flex items-center gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <MessagesSquare className="h-5 w-5" style={{ color: GOLD }} />
          <h2 className="flex-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
            {t("ui.foro.title")}
          </h2>
          <button
            onClick={onToggleMute}
            title={muted ? t("ui.foro.unmute") : t("ui.foro.mute")}
            aria-label={muted ? t("ui.foro.unmute") : t("ui.foro.mute")}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            {muted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
          </button>
          <button
            onClick={onClose}
            aria-label={t("ui.foro.close")}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Selector de topics (chips) */}
        <div className="flex gap-1 overflow-x-auto border-b border-gray-200 px-3 py-2 dark:border-gray-800">
          {topics.length === 0 && <span className="px-1 text-xs text-gray-400">{t("ui.foro.empty")}</span>}
          {topics.map((tp) => {
            const isActive = tp.id === activeId;
            return (
              <button
                key={tp.id}
                onClick={() => setActiveId(tp.id)}
                className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors ${
                  isActive
                    ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
                }`}
              >
                {tp.isReadOnly && <Lock className="h-3 w-3" />}
                {tp.title}
                {tp.unread > 0 && (
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: GOLD }} />
                )}
              </button>
            );
          })}
        </div>

        {/* Hilo */}
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
          {active && messages.length === 0 && (
            <p className="pt-6 text-center text-sm text-gray-400">{t("ui.foro.noMessages")}</p>
          )}
          {messages.map((m) => (
            <div key={m.id} className="group flex gap-2.5">
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                style={{ backgroundColor: m.source === "BOT" ? GOLD : "#6b7280" }}
              >
                {m.source === "BOT" ? "🤖" : initials(m.authorName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{m.authorName}</span>
                  <span className="text-[10px] text-gray-400">{timeFmt.format(new Date(m.createdAt))}</span>
                  {m.source === "TELEGRAM" && (
                    <span className="rounded bg-gray-100 px-1 text-[9px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                      Telegram
                    </span>
                  )}
                  {m.editedAt && <span className="text-[9px] text-gray-400">· {t("ui.foro.edited")}</span>}
                </div>
                {m.text && (
                  <p className="whitespace-pre-wrap break-words text-sm text-gray-800 dark:text-gray-200">
                    {m.text}
                  </p>
                )}
                {m.media.map((md) => (
                  <span
                    key={md.id}
                    className="mt-1 inline-block rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800"
                  >
                    📎 {md.fileName || md.mime}
                  </span>
                ))}
              </div>
              <button
                onClick={() => report(m.id)}
                title={t("ui.foro.report")}
                aria-label={t("ui.foro.report")}
                className="mt-0.5 shrink-0 text-gray-300 opacity-0 transition-opacity hover:text-gray-500 group-hover:opacity-100"
              >
                <Flag className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Composer (Fase 2) */}
        <footer className="border-t border-gray-200 px-4 py-3 dark:border-gray-800">
          {active?.isReadOnly ? (
            <p className="text-center text-xs text-gray-400">{t("ui.foro.readOnly")}</p>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder={t("ui.foro.composerPlaceholder")}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
              />
              <button
                onClick={() => void send()}
                disabled={sending || !draft.trim()}
                aria-label={t("ui.foro.send")}
                className="text-gray-400 transition-colors hover:text-gray-700 disabled:opacity-40 dark:hover:text-gray-200"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
