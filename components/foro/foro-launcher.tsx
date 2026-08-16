"use client";

import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  BellOff,
  Flag,
  Lock,
  Maximize2,
  MessageSquarePlus,
  MessageSquareX,
  MessagesSquare,
  Minimize2,
  Paperclip,
  Send,
  Unlink,
  X,
} from "lucide-react";
import { useI18n } from "../i18n";
import { useSidebarCollapse } from "../layout/sidebar-collapse-context";

const GOLD = "#b09a6e";
const MESSAGES_PAGE = 50; // debe coincidir con el límite por defecto de listMessages

/** Markdown → HTML mínimo y seguro para los mensajes del BOT (escapa y luego aplica
 *  enlaces [txt](url), negrita, cursiva, código y viñetas). Así las citas/tutoriales
 *  que MycoBot persiste en markdown se ven como ENLACES en la app, igual que en
 *  Telegram (antes salían como texto plano "[3]"). */
function botMdToHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    esc(s)
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:#b09a6e;text-decoration:underline">$1</a>',
      )
      .replace(/\*\*([^\n*]+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^\n*]+?)\*/g, "<em>$1</em>")
      .replace(/`([^`\n]+?)`/g, "<code>$1</code>");
  const out: string[] = [];
  let inList = false;
  for (const raw of md.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    const bullet = line.match(/^\s*[*\-+]\s+(.*)$/);
    if (bullet) {
      if (!inList) {
        out.push('<ul style="padding-left:18px;margin:4px 0">');
        inList = true;
      }
      out.push(`<li style="margin:2px 0">${inline(bullet[1])}</li>`);
      continue;
    }
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
    if (line.trim()) out.push(`<p style="margin:4px 0">${inline(line)}</p>`);
  }
  if (inList) out.push("</ul>");
  return out.join("");
}

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
  const [isMember, setIsMember] = useState(false);
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
        setIsMember(j?.data ? !!j.data.isMember : false);
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

  const acceptAndJoin = useCallback(async () => {
    setConnecting(true);
    // Abrimos la pestaña YA, dentro del gesto de clic, para que el bloqueador de
    // popups no la bloquee; le ponemos la URL cuando llega el invite link (tras el
    // await). Con `noopener` window.open devuelve null, así que no lo usamos aquí.
    const win = window.open("about:blank", "_blank");
    try {
      const r = await fetch("/api/foro/join-link", { method: "POST" });
      const j = await r.json();
      const inviteLink = j?.data?.inviteLink as string | undefined;
      if (inviteLink) {
        if (win) win.location.href = inviteLink;
        else window.location.href = inviteLink; // fallback si el popup fue bloqueado
      } else if (win) {
        win.close();
      }
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
            onUnlinked={() => {
              setLinked(false);
              setDrawerOpen(false);
              setUnread(0);
              setModCount(0);
            }}
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
              {isMember ? (
                <p className="mt-3 text-sm text-amber-600">{t("ui.foro.alreadyMember")}</p>
              ) : (
                <p className="mt-3 text-xs text-gray-400">{t("ui.foro.linkOpening")}</p>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setDialogOpen(false)}
                  className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  {t("ui.foro.linkCancel")}
                </button>
                {!isMember && (
                  <button
                    onClick={acceptAndJoin}
                    disabled={connecting}
                    className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                    style={{ backgroundColor: GOLD }}
                  >
                    {t("ui.foro.joinCta")}
                  </button>
                )}
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
  onUnlinked,
}: {
  muted: boolean;
  onToggleMute: () => void;
  onClose: () => void;
  onModCount: (n: number) => void;
  onUnlinked: () => void;
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
  const [uploading, setUploading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // Maximizar el drawer a todo el espacio de trabajo (como el rail de MycoBot).
  // El contexto de sidebar viaja por el portal (React lo preserva) → sabemos si el
  // sidebar está compacto para dejarlo visible al expandir.
  const { collapsed } = useSidebarCollapse();
  const [expanded, setExpanded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
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
    // Carga inicial: SOLO la página reciente (el API pagina, 50). Se pinta y se
    // salta al fondo AL INSTANTE (sin animación) → evita el molesto scroll continuo
    // desde el mensaje más antiguo hasta el más nuevo en canales con historia.
    getData<Message[]>(`/api/foro/messages?topicId=${activeId}`).then((m) => {
      if (!alive || !m) return;
      setMessages(m);
      setHasMore(m.length >= MESSAGES_PAGE);
      requestAnimationFrame(() => {
        const el = listRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
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
        // Solo auto-scroll (suave) si el usuario está cerca del fondo; si está
        // leyendo historia arriba, no le arrastramos el scroll.
        const el = listRef.current;
        const near = el ? el.scrollHeight - el.scrollTop - el.clientHeight < 120 : true;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        if (near) requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
      } catch {
        /* noop */
      }
    });
    return () => {
      alive = false;
      es.close();
    };
  }, [activeId]);

  // "Cargar mensajes anteriores": trae la página anterior (before = el más antiguo
  // cargado) y la PREPENDE, preservando la posición de scroll (sin saltos).
  const loadOlder = useCallback(async () => {
    if (loadingOlder || !activeId || !messages.length) return;
    setLoadingOlder(true);
    try {
      const oldest = messages[0].createdAt;
      const older = await getData<Message[]>(
        `/api/foro/messages?topicId=${activeId}&before=${encodeURIComponent(oldest)}`,
      );
      const el = listRef.current;
      const prevH = el?.scrollHeight ?? 0;
      if (older && older.length) {
        setMessages((prev) => {
          const ids = new Set(prev.map((x) => x.id));
          return [...older.filter((x) => !ids.has(x.id)), ...prev];
        });
        setHasMore(older.length >= MESSAGES_PAGE);
        requestAnimationFrame(() => {
          const el2 = listRef.current;
          if (el2) el2.scrollTop = el2.scrollHeight - prevH; // mantiene el punto de lectura
        });
      } else {
        setHasMore(false);
      }
    } finally {
      setLoadingOlder(false);
    }
  }, [activeId, messages, loadingOlder]);

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

  const unlink = useCallback(async () => {
    if (typeof window !== "undefined" && !window.confirm(t("ui.foro.unlinkConfirm"))) return;
    const r = await fetch("/api/foro/unlink", { method: "POST" });
    if (r.ok) onUnlinked();
  }, [onUnlinked, t]);

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

  // Adjuntar un archivo desde la app: sube por multipart a /api/foro/media, que
  // lo guarda en GCS y lo puentea a Telegram (foto/documento). El `draft` viaja
  // como pie opcional. La respuesta trae el mensaje ya creado (con media) → se
  // añade al hilo, igual que `send`.
  const onPickFile = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // permite re-seleccionar el mismo fichero
      if (!file || !activeId || uploading) return;
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append("topicId", activeId);
        fd.append("file", file);
        if (draft.trim()) fd.append("text", draft.trim());
        const r = await fetch("/api/foro/media", { method: "POST", body: fd });
        if (r.ok) {
          const j = await r.json();
          const m = j?.data as Message | undefined;
          if (m) setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          setDraft("");
        }
      } finally {
        setUploading(false);
      }
    },
    [activeId, draft, uploading],
  );

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
    <>
      {/* Backdrop modal SOLO en modo no-expandido (clic fuera cierra). Expandido =
          como MycoBot: ocupa el workspace y deja el sidebar usable, sin backdrop. */}
      {!expanded && <div className="fixed inset-0 z-[109] bg-black/40" onClick={onClose} />}
      <aside
        className={`fixed top-0 z-[110] flex h-full flex-col bg-white shadow-2xl transition-[left,max-width] duration-200 dark:bg-gray-900 ${
          expanded
            ? `left-0 right-0 w-auto max-w-none ${collapsed ? "lg:left-[64px]" : "lg:left-[220px]"}`
            : "right-0 w-full max-w-md"
        }`}
      >
        {/* Cabecera */}
        <header className="flex items-center gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <MessagesSquare className="h-5 w-5" style={{ color: GOLD }} />
          <h2 className="flex-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
            {t("ui.foro.title")}
          </h2>
          {/* Expandir / contraer (solo desktop, como MycoBot). */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? t("ui.foro.collapse") : t("ui.foro.expand")}
            aria-label={expanded ? t("ui.foro.collapse") : t("ui.foro.expand")}
            className="hidden text-gray-400 hover:text-gray-700 lg:block dark:hover:text-gray-200"
          >
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
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
            onClick={unlink}
            title={t("ui.foro.unlink")}
            aria-label={t("ui.foro.unlink")}
            className="text-gray-400 hover:text-red-600"
          >
            <Unlink className="h-4 w-4" />
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
        <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
          {hasMore && (
            <div className="pb-1 text-center">
              <button
                type="button"
                onClick={() => void loadOlder()}
                disabled={loadingOlder}
                className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                {loadingOlder ? t("ui.foro.loadingOlder") : t("ui.foro.loadOlder")}
              </button>
            </div>
          )}
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
                {m.text &&
                  (m.source === "BOT" ? (
                    // MycoBot persiste su respuesta en markdown (con fuentes/tutoriales
                    // como enlaces) → se renderiza para espejar las citas de Telegram.
                    <div
                      className="break-words text-sm text-gray-800 dark:text-gray-200"
                      dangerouslySetInnerHTML={{ __html: botMdToHtml(m.text) }}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap break-words text-sm text-gray-800 dark:text-gray-200">
                      {m.text}
                    </p>
                  ))}
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
              <input ref={fileRef} type="file" className="hidden" onChange={onPickFile} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading || sending}
                title={t("ui.foro.attach")}
                aria-label={t("ui.foro.attach")}
                className="shrink-0 text-gray-400 transition-colors hover:text-gray-700 disabled:opacity-40 dark:hover:text-gray-200"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                disabled={uploading}
                placeholder={uploading ? t("ui.foro.uploading") : t("ui.foro.composerPlaceholder")}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400 disabled:opacity-60"
              />
              <button
                onClick={() => void send()}
                disabled={sending || uploading || !draft.trim()}
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
      </aside>
    </>
  );
}
