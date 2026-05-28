"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Send,
  Loader2,
  ExternalLink,
  Scale,
  BookOpen,
  History,
  PlusCircle,
  ArrowLeft,
} from "lucide-react";
import { marked } from "marked";
import { useI18n } from "../i18n/i18n-context";
import { apiErrorMessage } from "../../lib/api-error";

marked.setOptions({ breaks: true, gfm: true });

/**
 * Renderiza el Markdown de la respuesta del bot a HTML. El texto viene del LLM:
 * escapamos `<` para neutralizar cualquier etiqueta HTML cruda (no puede haber
 * tag sin `<`), conservando `>` (citas markdown) y toda la sintaxis markdown
 * (negritas, listas, encabezados…), que no usa ángulos de apertura.
 */
function renderMarkdown(text: string): string {
  return marked.parse(text.replace(/</g, "&lt;"), { async: false }) as string;
}

// Cita devuelta por el backend (AskResult.citas de consultor).
interface Cita {
  resolucionId: string;
  ordinal: number;
  referenciaBoe: string | null;
  fecha: string | null;
  titulo: string | null;
}

// Cita al Manual / fichas de ayuda (AskResult.citasAyuda del carril de ayuda).
interface AyudaCita {
  appSlug: string;
  section: string;
  title: string | null;
  source: string; // 'MANUAL' | 'KB'
  href: string | null; // ruta relativa /manual/<section> (solo MANUAL)
}

interface Msg {
  role: "user" | "bot";
  text: string;
  citas?: Cita[];
  citasAyuda?: AyudaCita[];
  /** Skill que produjo la respuesta (badge): doctrina | ayuda | agente. */
  skill?: "doctrina" | "ayuda" | "agente" | "fuera";
  sinResultado?: boolean;
  error?: boolean;
}

// Resumen de conversación (GET …/conversaciones).
interface ConversacionResumen {
  id: string;
  titulo: string;
  updatedAt: string;
  turnos: number;
}

// Ficha de resolución para el visor in-rail (GET …/{id}).
interface ResolucionDetalle {
  id: string;
  ordinal: number;
  fecha: string | null;
  fechaRaw: string | null;
  clase: string | null;
  claseRaw: string | null;
  fuenteLabel: string | null;
  referenciaBoe: string | null;
  publicacion: string | null;
  norma: string | null;
  titulo: string | null;
  cabecera: string | null;
  resumen: string | null;
  body: string | null;
  categorias?: { categoria: string; categoriaRaw: string }[];
}

interface MycoBotRailProps {
  /** Gate: si la org no tiene Consultor, el rail NO se renderiza. */
  available?: boolean;
  /** Endpoint POST {pregunta, conversacionId?} → { data: { conversacionId, respuesta, citas, sinResultado } }. */
  askUrl?: string;
  /**
   * Base URL de Consultor para deep-link de citas (`${consultorUrl}/resoluciones/[id]`).
   * Pasar `""` cuando el rail se monta DENTRO de Consultor → enlaces relativos.
   * `undefined` → las citas no enlazan a la página completa (el visor in-rail sí funciona).
   */
  consultorUrl?: string;
  /**
   * Slug de la app desde la que se monta el rail (p.ej. "notaria"). Se envía en
   * cada `/ask` para seleccionar el addendum por-app del System Prompt y, más
   * adelante, dar foco a la recuperación de ayuda de producto.
   */
  appSlug?: string;
}

const OPEN_STORAGE_KEY = "mycolegal:mycobot:open";

type View = "chat" | "history" | "resolucion";

interface ViewerState {
  citas: Cita[];
  index: number;
  detalle: ResolucionDetalle | null;
  loading: boolean;
  error: boolean;
}

/**
 * Rail de chat de MycoBot (asistente de resoluciones). Colapsado por defecto
 * como un handle/chevron pegado al borde derecho; se abre con el chevron o con
 * el evento `mycolegal:open-mycobot` (detail.pregunta opcional) que dispara la
 * paleta de comandos. No es modal: la app sigue usable mientras está abierto.
 *
 * v2: conversación multi-turno (recuerda el hilo vía `conversacionId`), panel de
 * historial e inspección de citas SIN salir del rail (el visor preserva la
 * conversación, de modo que se puede navegar entre las resoluciones citadas y
 * volver al hilo intacto).
 *
 * Se monta UNA vez en el app-shell de cada app (como <IncidentReporter/>), con
 * `available` calculado server-side a partir de las apps de la org.
 */
export function MycoBotRail({ available = false, askUrl = "/api/resoluciones/ask", consultorUrl, appSlug }: MycoBotRailProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("chat");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [conversacionId, setConversacionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversaciones, setConversaciones] = useState<ConversacionResumen[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [corpus, setCorpus] = useState<{ total: number; hasDoctrina: boolean; hasDatos: boolean } | null>(
    null,
  );
  const threadRef = useRef<HTMLDivElement>(null);

  // Base de los endpoints de resoluciones (quita el sufijo `/ask`).
  const baseUrl = askUrl.replace(/\/ask$/, "");

  // Capacidades de MycoBot en esta app/org (welcome + chip): total del corpus,
  // hasDoctrina (org con Consultor) y hasDatos (app con tools del despacho).
  // Cacheado en el server; `appSlug` viaja también vía el proxy de otras apps.
  useEffect(() => {
    let alive = true;
    fetch(`${baseUrl}/stats?appSlug=${encodeURIComponent(appSlug ?? "")}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j?.data) {
          setCorpus({
            total: Number(j.data.resolucionesTotal) || 0,
            hasDoctrina: !!j.data.hasDoctrina,
            hasDatos: !!j.data.hasDatos,
          });
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [baseUrl, appSlug]);

  // Hidrata el estado abierto/colapsado (por defecto colapsado).
  useEffect(() => {
    try {
      if (window.localStorage.getItem(OPEN_STORAGE_KEY) === "true") setOpen(true);
    } catch {
      /* localStorage bloqueado: queda colapsado */
    }
  }, []);

  const setOpenPersisted = useCallback((next: boolean) => {
    setOpen(next);
    try {
      window.localStorage.setItem(OPEN_STORAGE_KEY, String(next));
    } catch {
      /* ignore */
    }
  }, []);

  const ask = useCallback(
    async (pregunta: string) => {
      const q = pregunta.trim();
      if (!q || loading) return;
      setView("chat");

      // Comando especial /help (alias /ayuda): ayuda sobre el propio MycoBot.
      // Se resuelve EN CLIENTE (i18n, sin llamar al backend ni gastar tokens).
      if (q === "/help" || q === "/ayuda") {
        setInput("");
        const caps: string[] = [];
        if (corpus?.hasDoctrina) caps.push(`- ${t("ui.mycobot.capDoctrina", { count: corpus.total.toLocaleString() })}`);
        caps.push(`- ${t("ui.mycobot.capAyuda")}`);
        if (corpus?.hasDatos) caps.push(`- ${t("ui.mycobot.capDatos")}`);
        const md = [
          `**${t("ui.mycobot.title")}**`,
          t("ui.mycobot.welcomeIntro"),
          caps.join("\n"),
          t("ui.mycobot.helpScope"),
          t("ui.mycobot.helpCite"),
          t("ui.mycobot.helpCommands"),
        ].join("\n\n");
        setMessages((m) => [...m, { role: "bot", text: md }]);
        return;
      }

      setInput("");
      setMessages((m) => [...m, { role: "user", text: q }]);
      setLoading(true);
      try {
        const res = await fetch(askUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pregunta: q, conversacionId, appSlug }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          // Patrón unificado: código→i18n, si no mensaje del backend (salvo 500),
          // si no el fallback del propio asistente. Ver lib/api-error.
          const msg = apiErrorMessage(
            t,
            { status: res.status, code: json?.error?.code, message: json?.error?.message },
            t("ui.mycobot.error"),
          );
          setMessages((m) => [...m, { role: "bot", text: msg, error: true }]);
          return;
        }
        const data = json.data ?? {};
        if (data.conversacionId) setConversacionId(data.conversacionId);
        setMessages((m) => [
          ...m,
          {
            role: "bot",
            text: data.respuesta ?? "",
            citas: data.citas ?? [],
            citasAyuda: data.citasAyuda ?? [],
            skill: data.skill,
            sinResultado: !!data.sinResultado,
          },
        ]);
      } catch {
        const msg = apiErrorMessage(t, { code: "NETWORK" }, t("ui.mycobot.error"));
        setMessages((m) => [...m, { role: "bot", text: msg, error: true }]);
      } finally {
        setLoading(false);
      }
    },
    [askUrl, conversacionId, loading, t, corpus],
  );

  // Empieza un hilo nuevo (no borra el historial persistido en el servidor).
  const newConversation = useCallback(() => {
    setMessages([]);
    setConversacionId(null);
    setViewer(null);
    setView("chat");
  }, []);

  // Abre el panel de historial y carga la lista de conversaciones.
  const openHistory = useCallback(async () => {
    setView("history");
    setHistoryLoading(true);
    try {
      const res = await fetch(`${baseUrl}/conversaciones`);
      const json = await res.json().catch(() => ({}));
      setConversaciones(res.ok ? json.data ?? [] : []);
    } catch {
      setConversaciones([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [baseUrl]);

  // Carga una conversación pasada como hilo activo.
  const loadConversation = useCallback(
    async (id: string) => {
      setView("chat");
      setLoading(true);
      setMessages([]);
      try {
        const res = await fetch(`${baseUrl}/conversaciones/${id}`);
        const json = await res.json().catch(() => ({}));
        const turnos: {
          pregunta: string;
          respuesta: string | null;
          citas?: Cita[];
          sinResultado?: boolean;
        }[] = res.ok ? json.data ?? [] : [];
        const msgs: Msg[] = [];
        for (const turno of turnos) {
          msgs.push({ role: "user", text: turno.pregunta });
          if (turno.respuesta != null) {
            msgs.push({
              role: "bot",
              text: turno.respuesta,
              citas: turno.citas ?? [],
              sinResultado: !!turno.sinResultado,
            });
          }
        }
        setMessages(msgs);
        setConversacionId(id);
      } catch {
        setMessages([{ role: "bot", text: t("ui.mycobot.error"), error: true }]);
      } finally {
        setLoading(false);
      }
    },
    [baseUrl, t],
  );

  // Abre el visor in-rail de una cita (sin cerrar ni resetear la conversación).
  const openCita = useCallback(
    async (citas: Cita[], index: number) => {
      setViewer({ citas, index, detalle: null, loading: true, error: false });
      setView("resolucion");
      try {
        const res = await fetch(`${baseUrl}/${citas[index].resolucionId}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setViewer((v) => (v ? { ...v, loading: false, error: true } : v));
          return;
        }
        setViewer((v) => (v ? { ...v, detalle: json.data ?? null, loading: false } : v));
      } catch {
        setViewer((v) => (v ? { ...v, loading: false, error: true } : v));
      }
    },
    [baseUrl],
  );

  const navCita = useCallback(
    (delta: number) => {
      if (!viewer) return;
      const next = viewer.index + delta;
      if (next < 0 || next >= viewer.citas.length) return;
      void openCita(viewer.citas, next);
    },
    [viewer, openCita],
  );

  // Pop-out desde la paleta de comandos: abre el rail y, si trae pregunta, la lanza.
  useEffect(() => {
    const handler = (e: Event) => {
      setOpenPersisted(true);
      const pregunta = (e as CustomEvent).detail?.pregunta as string | undefined;
      if (pregunta) void ask(pregunta);
    };
    window.addEventListener("mycolegal:open-mycobot", handler);
    return () => window.removeEventListener("mycolegal:open-mycobot", handler);
  }, [ask, setOpenPersisted]);

  // Auto-scroll al final del hilo.
  useEffect(() => {
    if (view === "chat") threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, view]);

  if (!available) return null;

  const citationHref = (c: { resolucionId: string }) =>
    consultorUrl !== undefined
      ? `${consultorUrl.replace(/\/$/, "")}/resoluciones/${c.resolucionId}`
      : undefined;

  // El rail se monta DENTRO de Consultor con `consultorUrl=""` (enlaces relativos).
  // En ese caso, seleccionar una cita abre la SECCIÓN de Resoluciones (`/resoluciones/[id]`)
  // en lugar del visor in-rail; en las demás apps no existe esa sección local, así que
  // se mantiene el visor in-rail (con su enlace "abrir ficha completa" a Consultor).
  const inConsultor = consultorUrl === "";

  // Ejemplos clicables del welcome (rellenan + lanzan). Dependen de las
  // capacidades de la app/org: doctrina (corpus), ayuda (siempre) y datos del
  // despacho (solo apps agénticas, con su pregunta específica por slug).
  const welcomeChips: string[] = [];
  if (corpus?.hasDoctrina) welcomeChips.push(t("ui.mycobot.chipDoctrina"));
  welcomeChips.push(t("ui.mycobot.chipAyuda"));
  if (corpus?.hasDatos && appSlug === "notaria") welcomeChips.push(t("ui.mycobot.chipDatosNotaria"));
  else if (corpus?.hasDatos && appSlug === "legifirma") welcomeChips.push(t("ui.mycobot.chipDatosLegifirma"));

  return (
    <>
      {/* Handle colapsado: borde derecho, vertical */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpenPersisted(true)}
          aria-label={t("ui.mycobot.railAria")}
          title={t("ui.mycobot.title")}
          className="fixed right-0 top-1/2 z-40 flex -translate-y-1/2 items-center gap-1 rounded-l-lg bg-cyan-600 py-3 pl-2 pr-1.5 text-white shadow-lg transition-colors hover:bg-cyan-700"
        >
          <Sparkles className="h-4 w-4" />
        </button>
      )}

      {/* Panel abierto: rail lateral derecho, no modal */}
      {open && (
        <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[380px] flex-col border-l bg-white shadow-2xl">
          <header className="flex items-center gap-2 border-b bg-cyan-600 px-4 py-3 text-white">
            <Sparkles className="h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">{t("ui.mycobot.title")}</p>
              <p className="text-[11px] leading-tight text-cyan-100">{t("ui.mycobot.subtitle")}</p>
            </div>
            <button
              type="button"
              onClick={() => (view === "history" ? setView("chat") : void openHistory())}
              aria-label={t("ui.mycobot.history")}
              title={t("ui.mycobot.history")}
              className={`rounded p-1 hover:bg-white/10 ${view === "history" ? "bg-white/15" : ""}`}
            >
              <History className="h-[18px] w-[18px]" />
            </button>
            <button
              type="button"
              onClick={newConversation}
              aria-label={t("ui.mycobot.newConversation")}
              title={t("ui.mycobot.newConversation")}
              className="rounded p-1 hover:bg-white/10"
            >
              <PlusCircle className="h-[18px] w-[18px]" />
            </button>
            <button
              type="button"
              onClick={() => setOpenPersisted(false)}
              aria-label={t("ui.mycobot.collapse")}
              className="rounded p-1 hover:bg-white/10"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </header>

          {/* Chip persistente: base de doctrina disponible (solo si la org tiene Consultor). */}
          {corpus?.hasDoctrina && (
            <div className="flex items-center gap-1.5 border-b bg-cyan-50 px-4 py-1.5 text-[11px] text-cyan-800">
              <Scale className="h-3.5 w-3.5 shrink-0 text-cyan-600" />
              <span>{t("ui.mycobot.corpusBadge", { count: corpus.total.toLocaleString() })}</span>
            </div>
          )}

          {/* ── Historial de conversaciones ─────────────────────────── */}
          {view === "history" && (
            <div className="flex-1 overflow-y-auto p-3">
              {historyLoading && (
                <div className="flex items-center gap-2 px-1 py-6 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("ui.mycobot.thinking")}
                </div>
              )}
              {!historyLoading && conversaciones && conversaciones.length === 0 && (
                <p className="px-1 py-6 text-center text-sm text-gray-500">{t("ui.mycobot.noHistory")}</p>
              )}
              {!historyLoading && conversaciones && conversaciones.length > 0 && (
                <ul className="space-y-1">
                  {conversaciones.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => void loadConversation(c.id)}
                        className={`w-full rounded-md px-3 py-2 text-left hover:bg-gray-100 ${c.id === conversacionId ? "bg-cyan-50" : ""}`}
                      >
                        <span className="block truncate text-sm text-gray-800">{c.titulo}</span>
                        <span className="mt-0.5 block text-[11px] text-gray-400">
                          {new Date(c.updatedAt).toLocaleDateString()} · {t("ui.mycobot.turnos", { n: c.turnos })}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ── Visor de resolución in-rail ─────────────────────────── */}
          {view === "resolucion" && viewer && (
            <>
              <div className="flex items-center gap-1 border-b bg-gray-50 px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => setView("chat")}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-cyan-700 hover:bg-gray-200"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {t("ui.mycobot.backToChat")}
                </button>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => navCita(-1)}
                    disabled={viewer.index === 0}
                    aria-label={t("ui.mycobot.prevCita")}
                    className="rounded p-1 hover:bg-gray-200 disabled:opacity-30"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-[11px] tabular-nums text-gray-500">
                    {viewer.index + 1}/{viewer.citas.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => navCita(1)}
                    disabled={viewer.index >= viewer.citas.length - 1}
                    aria-label={t("ui.mycobot.nextCita")}
                    className="rounded p-1 hover:bg-gray-200 disabled:opacity-30"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {viewer.loading && (
                  <div className="flex items-center gap-2 px-1 py-6 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("ui.mycobot.thinking")}
                  </div>
                )}
                {!viewer.loading && viewer.error && (
                  <p className="px-1 py-6 text-center text-sm text-red-600">{t("ui.mycobot.error")}</p>
                )}
                {!viewer.loading && !viewer.error && viewer.detalle && (
                  <article className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      {viewer.detalle.referenciaBoe && (
                        <span className="rounded bg-cyan-100 px-1.5 py-0.5 font-mono text-cyan-800">
                          {viewer.detalle.referenciaBoe}
                        </span>
                      )}
                      {(viewer.detalle.claseRaw || viewer.detalle.clase) && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">
                          {viewer.detalle.claseRaw || viewer.detalle.clase}
                        </span>
                      )}
                      {viewer.detalle.fecha && (
                        <span className="text-gray-500">{new Date(viewer.detalle.fecha).toLocaleDateString()}</span>
                      )}
                    </div>
                    {(viewer.detalle.cabecera || viewer.detalle.titulo) && (
                      <h2 className="text-sm font-semibold leading-snug text-gray-900">
                        {viewer.detalle.cabecera || viewer.detalle.titulo}
                      </h2>
                    )}
                    {viewer.detalle.resumen && (
                      <div
                        className="prose prose-sm max-w-none text-[13px] leading-relaxed text-gray-700 prose-p:my-1.5 prose-li:my-0"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(viewer.detalle.resumen) }}
                      />
                    )}
                    {viewer.detalle.body && (
                      <p className="whitespace-pre-wrap border-t pt-3 text-[13px] leading-relaxed text-gray-600">
                        {viewer.detalle.body}
                      </p>
                    )}
                    {citationHref({ resolucionId: viewer.detalle.id }) && (
                      <a
                        href={citationHref({ resolucionId: viewer.detalle.id })}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-cyan-700 hover:underline"
                      >
                        {t("ui.mycobot.openFull")}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </article>
                )}
              </div>
            </>
          )}

          {/* ── Conversación (chat) ─────────────────────────────────── */}
          {view === "chat" && (
            <>
              <div ref={threadRef} className="flex-1 space-y-3 overflow-y-auto p-4">
                {messages.length === 0 && (
                  <div className="px-1 py-4 text-sm text-gray-600">
                    <p className="font-semibold text-gray-800">{t("ui.mycobot.welcomeTitle")}</p>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-gray-500">
                      {t("ui.mycobot.welcomeIntro")}
                    </p>
                    <ul className="mt-2.5 space-y-1.5 text-[13px] text-gray-700">
                      {corpus?.hasDoctrina && (
                        <li className="flex items-start gap-1.5">
                          <Scale className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-600" />
                          <span>{t("ui.mycobot.capDoctrina", { count: corpus.total.toLocaleString() })}</span>
                        </li>
                      )}
                      <li className="flex items-start gap-1.5">
                        <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-600" />
                        <span>{t("ui.mycobot.capAyuda")}</span>
                      </li>
                      {corpus?.hasDatos && (
                        <li className="flex items-start gap-1.5">
                          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-600" />
                          <span>{t("ui.mycobot.capDatos")}</span>
                        </li>
                      )}
                    </ul>
                    {welcomeChips.length > 0 && (
                      <>
                        <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                          {t("ui.mycobot.welcomeTry")}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {welcomeChips.map((chip, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => void ask(chip)}
                              className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-left text-[12px] text-cyan-800 hover:bg-cyan-100"
                            >
                              {chip}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    <p className="mt-3 text-[11px] text-gray-400">{t("ui.mycobot.helpHint")}</p>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                    <div
                      className={
                        m.role === "user"
                          ? "max-w-[85%] rounded-lg bg-cyan-600 px-3 py-2 text-sm text-white"
                          : `max-w-[92%] rounded-lg px-3 py-2 text-sm ${m.error ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-800"}`
                      }
                    >
                      {m.role === "bot" && !m.error && m.skill && m.skill !== "fuera" && (
                        <span className="mb-1 inline-block rounded bg-gray-200 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-500">
                          {t(`ui.mycobot.skill_${m.skill}`)}
                        </span>
                      )}
                      {m.role === "bot" && !m.error ? (
                        // Respuesta del bot: Markdown. Si está fuera de ámbito (skill="fuera"),
                        // se muestra el mensaje i18n fijo en vez del texto del backend.
                        <div
                          className="leading-relaxed [&_a]:text-cyan-700 [&_a]:underline [&_code]:rounded [&_code]:bg-gray-200 [&_code]:px-1 [&_h1]:text-sm [&_h1]:font-bold [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:mt-0.5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4"
                          dangerouslySetInnerHTML={{
                            __html: renderMarkdown(m.skill === "fuera" ? t("ui.mycobot.outOfScope") : m.text),
                          }}
                        />
                      ) : (
                        <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                      )}
                      {m.role === "bot" && m.citasAyuda && m.citasAyuda.length > 0 && (
                        <div className="mt-2 border-t border-gray-200 pt-2">
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                            {t("ui.mycobot.sourcesManual")}
                          </p>
                          <ul className="space-y-1">
                            {m.citasAyuda.map((c, j) => {
                              const sameApp = !!appSlug && c.appSlug === appSlug;
                              const label = c.title || c.section;
                              const inner = (
                                <span className="flex items-start gap-1.5">
                                  <BookOpen className="mt-0.5 h-3 w-3 shrink-0 text-cyan-600" />
                                  <span className="min-w-0">
                                    <span className="block truncate text-[11px] text-gray-700">{label}</span>
                                    {!sameApp && (
                                      <span className="block text-[10px] uppercase tracking-wide text-gray-400">
                                        {c.appSlug}
                                      </span>
                                    )}
                                  </span>
                                  {sameApp && c.href && (
                                    <ChevronRight className="ml-auto mt-0.5 h-3 w-3 shrink-0 text-gray-400" />
                                  )}
                                </span>
                              );
                              const base = "block w-full rounded px-1 py-0.5 text-left";
                              return (
                                <li key={c.appSlug + c.section + j}>
                                  {sameApp && c.href ? (
                                    <a href={c.href} className={`${base} hover:bg-gray-200`}>
                                      {inner}
                                    </a>
                                  ) : (
                                    <span className={`${base} text-gray-500`}>{inner}</span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                      {m.role === "bot" && m.citas && m.citas.length > 0 && (
                        <div className="mt-2 border-t border-gray-200 pt-2">
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                            {t("ui.mycobot.sources")}
                          </p>
                          <ul className="space-y-1">
                            {m.citas.map((c, j) => {
                              const label = c.referenciaBoe || `#${c.ordinal}`;
                              const cls = "block w-full rounded px-1 py-0.5 text-left hover:bg-gray-200";
                              const inner = (
                                <span className="flex items-start gap-1.5">
                                  <Scale className="mt-0.5 h-3 w-3 shrink-0 text-cyan-600" />
                                  <span className="min-w-0">
                                    <span className="font-mono text-[11px] text-cyan-700">
                                      [{j + 1}] {label}
                                    </span>
                                    {c.titulo && (
                                      <span className="block truncate text-[11px] text-gray-500">{c.titulo}</span>
                                    )}
                                  </span>
                                  <ChevronRight className="ml-auto mt-0.5 h-3 w-3 shrink-0 text-gray-400" />
                                </span>
                              );
                              return (
                                <li key={c.resolucionId + j}>
                                  {inConsultor ? (
                                    // Dentro de Consultor: navega a la sección de Resoluciones.
                                    <a href={`/resoluciones/${c.resolucionId}`} className={cls}>
                                      {inner}
                                    </a>
                                  ) : (
                                    // En otras apps: visor de la resolución dentro del propio rail.
                                    <button
                                      type="button"
                                      onClick={() => void openCita(m.citas!, j)}
                                      className={cls}
                                    >
                                      {inner}
                                    </button>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex items-center gap-2 px-1 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("ui.mycobot.thinking")}
                  </div>
                )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void ask(input);
                }}
                className="border-t p-3"
              >
                <div className="flex items-end gap-2">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void ask(input);
                      }
                    }}
                    rows={2}
                    placeholder={t("ui.mycobot.placeholder")}
                    aria-label={t("ui.mycobot.placeholder")}
                    className="min-h-[40px] flex-1 resize-none rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                  />
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    aria-label={t("ui.mycobot.send")}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-40"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-1.5 text-[10px] text-gray-400">{t("ui.mycobot.disclaimer")}</p>
              </form>
            </>
          )}
        </aside>
      )}
    </>
  );
}
