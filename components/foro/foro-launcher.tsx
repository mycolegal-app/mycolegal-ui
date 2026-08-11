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
  authorTgId: string | null;
  text: string | null;
  replyToId: string | null;
  createdAt: string;
  editedAt: string | null;
  media: { id: string; mime: string; fileName: string | null }[];
}
interface Report {
  id: string;
  motivo: string;
  reporterUserId: string;
  createdAt: string;
  message: { id: string; authorName: string; text: string | null; createdAt: string; modState: string };
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
  const [modCount, setModCount] = useState(0);
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

  // Reportes pendientes (marca "!" del moderador). 403 → no es moderador.
  useEffect(() => {
    if (!linked) return;
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/foro/moderation");
        if (!r.ok) {
          if (alive && r.status === 403) setModCount(0);
          return;
        }
        const j = await r.json();
        if (alive) setModCount(Array.isArray(j?.data) ? j.data.length : 0);
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
  }, [linked]);

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
      setDialogOpen(false);
      // Poll de estado hasta que el usuario complete /start en Telegram (~2 min):
      // así el icono pasa a "vinculado" sin recargar la app.
      let tries = 0;
      const poll = setInterval(async () => {
        tries += 1;
        try {
          const s = await fetch("/api/foro/link/status");
          const sj = s.ok ? await s.json() : null;
          if (sj?.data?.linked) {
            setLinked(true);
            setMuted(!!sj.data.muted);
            clearInterval(poll);
          }
        } catch {
          /* noop */
        }
        if (tries >= 40) clearInterval(poll);
      }, 3000);
    } finally {
      setConnecting(false);
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
        {linked && modCount > 0 && (
          <span
            className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold leading-none text-white ring-1 ring-black/10"
            title={t("ui.foro.modReportedTitle")}
          >
            !
          </span>
        )}
      </button>

      {drawerOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <ForoDrawerPanel
            muted={muted}
            onToggleMute={toggleMute}
            onClose={() => setDrawerOpen(false)}
            onModCount={setModCount}
          />,
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

/** Avatar del autor: foto real de Telegram (cacheada) con fallback a iniciales. */
function MessageAvatar({ name, tgId, isBot }: { name: string; tgId: string | null; isBot: boolean }) {
  const [failed, setFailed] = useState(false);
  const showImg = !!tgId && !isBot && !failed;
  return (
    <div
      className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-semibold text-white"
      style={{ backgroundColor: isBot ? GOLD : "#6b7280" }}
    >
      {isBot ? (
        "🤖"
      ) : showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/foro/avatar/${tgId}`}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        initials(name)
      )}
    </div>
  );
}

/** Panel deslizante (drawer) con topics + hilo + SSE en vivo. */
function ForoDrawerPanel({
  muted,
  onToggleMute,
  onClose,
  onModCount,
}: {
  muted: boolean;
  onToggleMute: () => void;
  onClose: () => void;
  onModCount: (n: number) => void;
}) {
  const { t, language } = useI18n();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [modReports, setModReports] = useState<Report[]>([]);
  const [canModerate, setCanModerate] = useState(false);
  const [modView, setModView] = useState(false);
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

  useEffect(() => {
    let alive = true;
    fetch("/api/foro/moderation")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j) return;
        setCanModerate(true);
        const list = (j.data as Report[]) ?? [];
        setModReports(list);
        onModCount(list.length);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [onModCount]);

  const resolveReport = useCallback(
    async (reportId: string, action: "OCULTAR" | "DESCARTAR") => {
      const rep = modReports.find((x) => x.id === reportId);
      const r = await fetch("/api/foro/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, action }),
      });
      if (!r.ok) return;
      setModReports((rs) => {
        const next = rs.filter((x) => x.id !== reportId);
        onModCount(next.length);
        if (next.length === 0) setModView(false);
        return next;
      });
      if (action === "OCULTAR" && rep) {
        setMessages((ms) => ms.filter((m) => m.id !== rep.message.id));
      }
    },
    [modReports, onModCount],
  );

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
          {canModerate && modReports.length > 0 && (
            <button
              onClick={() => setModView((v) => !v)}
              title={t("ui.foro.modReportedTitle")}
              aria-label={t("ui.foro.modReportedTitle")}
              className={`relative ${modView ? "text-red-600" : "text-gray-400 hover:text-red-600"}`}
            >
              <Flag className="h-4 w-4" />
              <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white">
                {modReports.length}
              </span>
            </button>
          )}
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

        {modView ? (
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {modReports.length === 0 && (
              <p className="pt-6 text-center text-sm text-gray-400">{t("ui.foro.modEmpty")}</p>
            )}
            {modReports.map((rep) => (
              <div key={rep.id} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                <div className="text-sm text-gray-800 dark:text-gray-200">
                  <span className="font-medium">{rep.message.authorName}</span>: {rep.message.text || "—"}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {t("ui.foro.modMotivo")}: {rep.motivo || "—"}
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => resolveReport(rep.id, "OCULTAR")}
                    className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-xs text-white hover:bg-red-700"
                  >
                    {t("ui.foro.modHide")}
                  </button>
                  <button
                    onClick={() => resolveReport(rep.id, "DESCARTAR")}
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    {t("ui.foro.modDismiss")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>

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
              <MessageAvatar name={m.authorName} tgId={m.authorTgId} isBot={m.source === "BOT"} />
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
                {m.media.map((md) =>
                  md.mime.startsWith("image/") ? (
                    <a
                      key={md.id}
                      href={`/api/foro/media/${md.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/foro/media/${md.id}`}
                        alt={md.fileName || ""}
                        className="mt-1 max-h-48 max-w-full rounded-lg"
                      />
                    </a>
                  ) : (
                    <a
                      key={md.id}
                      href={`/api/foro/media/${md.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 hover:underline dark:bg-gray-800 dark:text-gray-300"
                    >
                      📎 {md.fileName || md.mime}
                    </a>
                  ),
                )}
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
          </>
        )}
      </div>
    </div>
  );
}
