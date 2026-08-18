"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Maximize2,
  Minimize2,
  Send,
  Loader2,
  ExternalLink,
  Scale,
  BookOpen,
  History,
  PlusCircle,
  ArrowLeft,
  Coins,
  SlidersHorizontal,
  X,
  Check,
  Gavel,
  ScrollText,
  Landmark,
  Globe,
  ShieldCheck,
  Stamp,
  Building2,
  Car,
  FileQuestion,
  type LucideIcon,
} from "lucide-react";
import { marked } from "marked";
import { useI18n } from "../i18n/i18n-context";
import { useSidebarCollapse } from "../layout/sidebar-collapse-context";
import { cn } from "../../lib/utils";
import { apiErrorMessage } from "../../lib/api-error";
import { readClasesSel, writeClasesSel, CLASES_CHANGED_EVENT } from "../../lib/biblioteca-clases";
import { readFuentesSel } from "../../lib/biblioteca-fuentes";
import { FuentesModal } from "./fuentes-modal";

// Estilo de las pastillas de clase en el modal /sources (mismo criterio de color
// que la leyenda de la Biblioteca del Consultor). El label sale de i18n
// (`ui.mycobot.clases.<CLASE>`), con fallback al propio código.
const CLASE_COLOR: Record<string, string> = {
  RESOLUCIONES_DGRN: "bg-cyan-100 text-cyan-800 border-cyan-300",
  RESOLUCIONES_DGDEJ: "bg-red-100 text-red-800 border-red-300",
  SISTEMA_NOTARIAL: "bg-indigo-100 text-indigo-800 border-indigo-300",
  DOCTRINA: "bg-violet-100 text-violet-800 border-violet-300",
  JURISPRUDENCIA: "bg-amber-100 text-amber-800 border-amber-300",
  LEGISLACION: "bg-emerald-100 text-emerald-800 border-emerald-300",
  LEGISLACION_AUTONOMICA: "bg-emerald-100 text-emerald-800 border-emerald-300",
  LEGISLACION_UE: "bg-blue-100 text-blue-800 border-blue-300",
  GUIAS: "bg-amber-100 text-amber-800 border-amber-300",
  FUNDACIONES: "bg-orange-100 text-orange-800 border-orange-300",
  BIENES_MUEBLES: "bg-lime-100 text-lime-800 border-lime-300",
  OTROS: "bg-gray-100 text-gray-700 border-gray-300",
};

// Icono + color del icono por clase (para el badge de tipo en las citas de MycoBot,
// #548). Mismo criterio que la Biblioteca del Consultor.
const CLASE_ICON: Record<string, LucideIcon> = {
  RESOLUCIONES_DGRN: Gavel,
  RESOLUCIONES_DGDEJ: Gavel,
  SISTEMA_NOTARIAL: Stamp,
  DOCTRINA: BookOpen,
  JURISPRUDENCIA: Scale,
  LEGISLACION: ScrollText,
  LEGISLACION_AUTONOMICA: Landmark,
  LEGISLACION_UE: Globe,
  GUIAS: ShieldCheck,
  FUNDACIONES: Building2,
  BIENES_MUEBLES: Car,
  OTROS: FileQuestion,
};

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

/**
 * Convierte las marcas de cita `[n]` del HTML ya renderizado en anclas clicables
 * que apuntan a la fuente n-ésima (misma acción que la lista de Fuentes del final).
 * Se aplica DESPUÉS de `renderMarkdown` para inyectar `<a>` sin que se escapen.
 * Solo enlaza `[n]` con n dentro del rango de citas disponibles.
 */
function linkifyCitas(html: string, n: number): string {
  if (n <= 0) return html;
  // Marca de cita: un número `[n]` O un grupo `[n, m, …]`. El modelo a veces
  // agrupa varias fuentes en un mismo corchete ("[2, 3]"); las separamos en
  // anclas individuales contiguas ("[2][3]") para que CADA fuente sea clicable.
  // Si algún número del grupo cae fuera de rango, no lo tratamos como cita (p. ej.
  // "[2, 2020]") y lo dejamos intacto.
  return html.replace(/\[\s*(\d{1,3}(?:\s*,\s*\d{1,3})*)\s*\]/g, (full, group: string) => {
    const nums = group.split(",").map((s) => Number(s.trim()));
    if (nums.some((k) => !(k >= 1 && k <= n))) return full;
    return nums
      .map((k) => `<a class="cita-ref" data-cita="${k - 1}" role="button" tabindex="0">[${k}]</a>`)
      .join("");
  });
}

/** Parsea un bloque de evento SSE (`event: …\ndata: …`). `data` es JSON en una línea. */
function parseSse(raw: string): { event: string; data: unknown } | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
  }
  if (!dataLines.length) return null;
  try {
    return { event, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return null;
  }
}

/** Paso del bucle agéntico para el log «Ver proceso» (uno por transición). */
interface StepRecord {
  kind: "status" | "tool";
  label: string;
  query?: string;
  hint?: string;
  error?: boolean;
}

/** Payload del evento SSE `done` (cierre del turno agéntico). */
interface DonePayload {
  conversacionId?: string;
  respuesta?: string;
  citas?: Cita[];
  citasAyuda?: AyudaCita[];
  skill?: Msg["skill"];
  sinResultado?: boolean;
}

// Cita devuelta por el backend (AskResult.citas de consultor).
interface Cita {
  resolucionId: string;
  ordinal: number;
  referenciaBoe: string | null;
  fecha: string | null;
  titulo: string | null;
  clase?: string; // clase de la resolución citada (badge de tipo)
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
  /** Pasos que siguió el bucle agéntico (para «Ver proceso»). */
  steps?: StepRecord[];
}

// Resumen de conversación (GET …/conversaciones).
interface ConversacionResumen {
  id: string;
  titulo: string;
  updatedAt: string;
  turnos: number;
  /** Conversación originada en el DM 1:1 con MycoBot en Telegram. */
  esTelegram?: boolean;
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
// #1 (consultor) — el usuario que entra por primera vez no sabe que puede
// preguntar a MycoBot. Mostramos un globo descartable junto al lanzador hasta
// que abra el rail una vez o lo cierre; la preferencia se recuerda en
// localStorage (no vuelve a salir).
const ONBOARD_STORAGE_KEY = "mycolegal:mycobot:onboarded";
// Hilo activo persistido SOLO en Consultor: al pinchar una cita se navega
// full-page a `/resoluciones/[id]` (output: 'standalone' fuerza recarga), lo que
// desmontaría el rail y perdería la conversación. Lo guardamos en sessionStorage
// (vive en la pestaña/sesión, no entre días) para rehidratarlo tras la recarga y
// poder saltar de una referencia a otra sin reiniciar el hilo.
const THREAD_STORAGE_KEY = "mycolegal:mycobot:thread";
// #1 (consultor) — al pinchar una cita colapsamos el rail y navegamos full-page a
// la ficha de la resolución para no taparla. Este flag (sesión) marca que, al
// VOLVER a la Biblioteca (`/resoluciones`), hay que REABRIR el rail para devolver
// al usuario a la conversación rehidratada — sin él, el rail se quedaba colapsado
// (open=false persistido) y el usuario veía la pantalla inicial creyendo que había
// perdido la respuesta. En la propia ficha `/resoluciones/[id]` NO se reabre.
const REOPEN_STORAGE_KEY = "mycolegal:mycobot:reopen";

// #563(a) — altura máxima del textarea de entrada antes de activar scroll interno.
const MAX_INPUT_PX = 160;

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
  const { t, language } = useI18n();
  const { collapsed } = useSidebarCollapse();
  const [open, setOpen] = useState(false);
  // #563 — modo expandido: el rail ocupa toda la pantalla salvo el sidebar
  // izquierdo, y muestra la lista de conversaciones a la izquierda.
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<View>("chat");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [conversacionId, setConversacionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // Paso en curso del bucle agéntico que se muestra en vivo (línea que se sustituye).
  const [stepLive, setStepLive] = useState<{ label: string; query?: string; hint?: string; error?: boolean } | null>(null);
  // Mensajes cuyo «Ver proceso» está desplegado (por índice de mensaje).
  const [openProcess, setOpenProcess] = useState<Set<number>>(new Set());
  // Índice del mensaje cuya respuesta se acaba de copiar al portapapeles (feedback ✓).
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const copyAnswer = useCallback(async (idx: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx((c) => (c === idx ? null : c)), 1800);
    } catch {
      // Portapapeles no disponible (permiso/contexto no seguro): no rompemos nada.
    }
  }, []);
  const [conversaciones, setConversaciones] = useState<ConversacionResumen[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [corpus, setCorpus] = useState<{
    total: number;
    hasDoctrina: boolean;
    hasDatos: boolean;
    clases: { clase: string; count: number }[];
  } | null>(null);
  // Modal /sources: selección de CLASES que MycoBot considera. `clasesSel` = null →
  // todas (sin selección guardada). Persistida en cookie del dominio padre (helper),
  // compartida con la página de Biblioteca y entre apps.
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [clasesSel, setClasesSel] = useState<string[] | null>(null);
  const [wallet, setWallet] = useState<{ total: number; blocked: boolean; nextCreditProgress: number } | null>(
    null,
  );
  // #1 — globo de onboarding: null hasta hidratar, luego true/false.
  const [showOnboard, setShowOnboard] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  // #563(a) — textarea de entrada auto-crece con el contenido (hasta un máximo,
  // luego scroll interno). El hilo de arriba se reajusta solo por el layout flex.
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Carga la selección de clases (cookie compartida) al montar, al abrir el modal y
  // cuando otro consumidor del mismo origen (la página de Biblioteca) la cambia.
  useEffect(() => {
    const sync = () => setClasesSel(readClasesSel());
    sync();
    window.addEventListener(CLASES_CHANGED_EVENT, sync);
    return () => window.removeEventListener(CLASES_CHANGED_EVENT, sync);
  }, [sourcesOpen]);

  // Base de los endpoints de resoluciones (quita el sufijo `/ask`).
  const baseUrl = askUrl.replace(/\/ask$/, "");

  // Saldo del monedero único de créditos de IA de la org (mismo canal que el
  // resto del rail: en Consultor lo sirve /api/resoluciones/credit-balance y en
  // otras apps su proxy lo reenvía a /api/inter/resoluciones/credit-balance).
  const refreshBalance = useCallback(async () => {
    try {
      const r = await fetch(`${baseUrl}/credit-balance`);
      if (!r.ok) return;
      const d = await r.json();
      if (typeof d?.total === "number")
        setWallet({
          total: d.total,
          blocked: !!d.blocked,
          nextCreditProgress: typeof d.nextCreditProgress === "number" ? d.nextCreditProgress : 0,
        });
    } catch {
      /* el indicador es opcional */
    }
  }, [baseUrl]);

  // Refresca el saldo al abrir el rail.
  useEffect(() => {
    if (open) void refreshBalance();
  }, [open, refreshBalance]);

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
            clases: Array.isArray(j.data.clases)
              ? j.data.clases.map((c: { clase: string; count: number }) => ({
                  clase: String(c.clase),
                  count: Number(c.count) || 0,
                }))
              : [],
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
      const isOpen = window.localStorage.getItem(OPEN_STORAGE_KEY) === "true";
      if (isOpen) setOpen(true);
      // #1 — globo de onboarding solo si nunca lo ha visto Y el rail está
      // colapsado (si ya está abierto, no aporta nada).
      if (!isOpen && window.localStorage.getItem(ONBOARD_STORAGE_KEY) !== "true") {
        setShowOnboard(true);
      }
    } catch {
      /* localStorage bloqueado: queda colapsado */
    }
  }, []);

  // #1 — descarta el globo de onboarding (al abrir el rail o al cerrarlo a mano)
  // y recuerda la preferencia para no volver a mostrarlo.
  const dismissOnboard = useCallback(() => {
    setShowOnboard(false);
    try {
      window.localStorage.setItem(ONBOARD_STORAGE_KEY, "true");
    } catch {
      /* ignore */
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

  // Rehidrata el hilo activo tras una navegación full-page (solo Consultor).
  // Restaura mensajes + conversacionId desde sessionStorage, así el usuario puede
  // colapsar el rail al abrir una resolución y luego volver a la conversación
  // intacta para saltar a otra referencia citada.
  useEffect(() => {
    if (consultorUrl !== "") return;
    try {
      const raw = window.sessionStorage.getItem(THREAD_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { messages?: Msg[]; conversacionId?: string | null };
      if (Array.isArray(saved.messages) && saved.messages.length) {
        setMessages(saved.messages);
        setConversacionId(saved.conversacionId ?? null);
        // Si venimos de abrir una cita y hemos vuelto a la Biblioteca, reabrimos el
        // rail sobre la conversación. En la ficha `/resoluciones/[id]` dejamos el
        // flag intacto (rail colapsado) hasta que se pise la Biblioteca al volver.
        if (window.sessionStorage.getItem(REOPEN_STORAGE_KEY) === "true") {
          const onLibrary =
            window.location.pathname.replace(/\/+$/, "") === "/resoluciones";
          if (onLibrary) {
            window.sessionStorage.removeItem(REOPEN_STORAGE_KEY);
            setOpenPersisted(true);
          }
        }
      }
    } catch {
      /* sessionStorage bloqueado o JSON corrupto: empieza hilo limpio */
    }
  }, [consultorUrl, setOpenPersisted]);

  // Persiste el hilo activo en cada cambio (solo Consultor). Solo escribe: el
  // borrado es explícito en newConversation(), para no limpiar la clave en el
  // primer render (messages=[]) justo después de rehidratarla.
  useEffect(() => {
    if (consultorUrl !== "" || !messages.length) return;
    try {
      window.sessionStorage.setItem(
        THREAD_STORAGE_KEY,
        JSON.stringify({ messages, conversacionId }),
      );
    } catch {
      /* ignore */
    }
  }, [consultorUrl, messages, conversacionId]);

  const ask = useCallback(
    async (pregunta: string) => {
      const q = pregunta.trim();
      if (!q || loading) return;

      // Comando especial /sources (alias /fuentes): abre el modal de selección de
      // clases de la Biblioteca. Se resuelve EN CLIENTE (no llama al backend).
      if (q === "/sources" || q === "/fuentes") {
        setInput("");
        setClasesSel(readClasesSel());
        setSourcesOpen(true);
        return;
      }

      // Comando especial /new (alias /nuevo, /clear): inicia una conversación
      // nueva, igual que el botón ➕ (mismo efecto que newConversation()). Se
      // resuelve EN CLIENTE. Paridad con el /new del DM de Telegram.
      if (q === "/new" || q === "/nuevo" || q === "/clear") {
        setInput("");
        setMessages([]);
        setConversacionId(null);
        setViewer(null);
        setView("chat");
        try {
          window.sessionStorage.removeItem(THREAD_STORAGE_KEY);
        } catch {
          /* ignore */
        }
        return;
      }

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
          t("ui.mycobot.helpManual"),
          t("ui.mycobot.helpCommands"),
        ].join("\n\n");
        setMessages((m) => [...m, { role: "bot", text: md }]);
        return;
      }

      setInput("");
      setMessages((m) => [...m, { role: "user", text: q }]);
      setLoading(true);
      setStepLive(null);
      const steps: StepRecord[] = [];
      let answerText = "";
      try {
        const res = await fetch(askUrl, {
          method: "POST",
          // Pedimos SSE: el bucle agéntico emite sus pasos (mata el "Pensando…"
          // eterno) y mantiene viva la conexión (mata el timeout de 30s).
          headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
          // Scope por CLASE: la selección de la Biblioteca (cookie compartida,
          // editable con /sources). Ausente/null = todas las clases.
          body: JSON.stringify({
            pregunta: q,
            conversacionId,
            appSlug,
            // Idioma de la UI → MycoBot acota el Manual a esa lengua (citas en el
            // idioma que lee el usuario, no mezcladas).
            lang: language,
            clases: readClasesSel() ?? undefined,
            // Scope por FUENTE (el otro nivel del modal de Fuentes). AND con clases.
            fuentes: readFuentesSel() ?? undefined,
          }),
        });

        const ctype = res.headers.get("content-type") ?? "";
        // Fallback JSON: error temprano, o backend/proxy sin streaming todavía.
        if (!res.ok || !res.body || !ctype.includes("text/event-stream")) {
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
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
          return;
        }

        // ── Consumo del stream SSE ──────────────────────────────────────────
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let final: DonePayload | null = null;
        let errored: { code?: string; message?: string } | null = null;
        let lastTool: StepRecord | null = null;

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let sep: number;
          while ((sep = buf.indexOf("\n\n")) !== -1) {
            const rawEv = buf.slice(0, sep);
            buf = buf.slice(sep + 2);
            const ev = parseSse(rawEv);
            if (!ev) continue;
            if (ev.event === "step") {
              const s = ev.data as { type: string; phase?: string; label: string; query?: string; hint?: string };
              if (s.type === "status") {
                steps.push({ kind: "status", label: s.label });
                setStepLive({ label: s.label });
              } else if (s.type === "tool") {
                if (s.phase === "start") {
                  lastTool = { kind: "tool", label: s.label, query: s.query };
                  steps.push(lastTool);
                  setStepLive({ label: s.label, query: s.query });
                } else if (s.phase === "done") {
                  if (lastTool) lastTool.hint = s.hint;
                  setStepLive({ label: s.label, hint: s.hint });
                } else if (s.phase === "error") {
                  if (lastTool) lastTool.error = true;
                  setStepLive({ label: s.label, error: true });
                }
              }
            } else if (ev.event === "token") {
              answerText += (ev.data as { text?: string }).text ?? "";
            } else if (ev.event === "done") {
              final = ev.data as DonePayload;
            } else if (ev.event === "error") {
              errored = ev.data as { code?: string; message?: string };
            }
          }
        }

        if (errored) {
          const msg = apiErrorMessage(t, { code: errored.code, message: errored.message }, t("ui.mycobot.error"));
          setMessages((m) => [...m, { role: "bot", text: msg, error: true }]);
          return;
        }
        if (final?.conversacionId) setConversacionId(final.conversacionId);
        setMessages((m) => [
          ...m,
          {
            role: "bot",
            text: final?.respuesta ?? answerText,
            citas: final?.citas ?? [],
            citasAyuda: final?.citasAyuda ?? [],
            skill: final?.skill,
            sinResultado: !!final?.sinResultado,
            steps: steps.length ? steps.slice() : undefined,
          },
        ]);
      } catch {
        const msg = apiErrorMessage(t, { code: "NETWORK" }, t("ui.mycobot.error"));
        setMessages((m) => [...m, { role: "bot", text: msg, error: true }]);
      } finally {
        setLoading(false);
        setStepLive(null);
        void refreshBalance(); // la consulta puede haber gastado créditos
      }
    },
    [askUrl, conversacionId, loading, t, corpus, refreshBalance],
  );

  // Empieza un hilo nuevo (no borra el historial persistido en el servidor).
  const newConversation = useCallback(() => {
    setMessages([]);
    setConversacionId(null);
    setViewer(null);
    setView("chat");
    try {
      window.sessionStorage.removeItem(THREAD_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  // Carga la lista de conversaciones (sin cambiar de vista). La usan tanto el panel
  // de historial (vista "history") como la columna izquierda del modo expandido.
  const loadConversaciones = useCallback(async () => {
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

  // Abre el panel de historial y carga la lista de conversaciones.
  const openHistory = useCallback(async () => {
    setView("history");
    await loadConversaciones();
  }, [loadConversaciones]);

  // #563(b) — alterna el modo expandido. Al entrar, la lista de conversaciones vive
  // a la izquierda (se carga) y el panel derecho vuelve al chat.
  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      if (next) {
        setView((v) => (v === "history" ? "chat" : v));
        void loadConversaciones();
      }
      return next;
    });
  }, [loadConversaciones]);

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
      const detail = (e as CustomEvent).detail ?? {};
      // `view:'history'` abre directamente la lista de consultas anteriores (el
      // botón "Historial" de la pantalla de Consultor, #1 — descubribilidad).
      if (detail.view === "history") {
        void openHistory();
        return;
      }
      // El scope de clases lo lee el `ask` de la cookie compartida (que la propia
      // Biblioteca escribe), así que aquí solo abrimos y lanzamos la pregunta.
      const pregunta = detail.pregunta as string | undefined;
      if (pregunta) void ask(pregunta);
    };
    window.addEventListener("mycolegal:open-mycobot", handler);
    return () => window.removeEventListener("mycolegal:open-mycobot", handler);
  }, [ask, openHistory, setOpenPersisted]);

  // Auto-scroll al final del hilo.
  useEffect(() => {
    if (view === "chat") threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, view]);

  // #563(a) — auto-grow del textarea: crece con el contenido hasta MAX_INPUT_PX y a
  // partir de ahí hace scroll interno. Se recalcula en cada cambio de `input` (incl.
  // el reset a "" tras enviar, que lo devuelve a la altura mínima).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_PX)}px`;
  }, [input, open, expanded]);

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

  // Salto a una fuente citada, unificado para la lista de Fuentes y las marcas
  // `[n]` inline: en Consultor navega a la sección de Resoluciones (preservando el
  // hilo); en otras apps abre el visor in-rail.
  const goToCita = (citas: Cita[], index: number) => {
    if (index < 0 || index >= citas.length) return;
    if (inConsultor) {
      const fuentes = citas.map((x) => x.resolucionId).join(",");
      // Colapsa el rail para no tapar la ficha, pero deja marcado que al volver a
      // la Biblioteca hay que reabrirlo sobre la conversación (ver REOPEN_STORAGE_KEY).
      try {
        window.sessionStorage.setItem(REOPEN_STORAGE_KEY, "true");
      } catch {
        /* ignore */
      }
      setOpenPersisted(false);
      window.location.href = `/resoluciones/${citas[index].resolucionId}?fuentes=${encodeURIComponent(fuentes)}&fi=${index}`;
    } else {
      void openCita(citas, index);
    }
  };

  // Ejemplos clicables del welcome (rellenan + lanzan). Dependen de las
  // capacidades de la app/org: doctrina (corpus), ayuda (siempre) y datos del
  // despacho (solo apps agénticas, con su pregunta específica por slug).
  const welcomeChips: string[] = [];
  if (corpus?.hasDoctrina) welcomeChips.push(t("ui.mycobot.chipDoctrina"));
  welcomeChips.push(t("ui.mycobot.chipAyuda"));
  if (corpus?.hasDatos && appSlug === "notaria") welcomeChips.push(t("ui.mycobot.chipDatosNotaria"));
  else if (corpus?.hasDatos && appSlug === "legifirma") welcomeChips.push(t("ui.mycobot.chipDatosLegifirma"));

  // ── /sources: clases de la Biblioteca que MycoBot considera ───────────────
  const claseLabel = (clase: string) => t(`ui.mycobot.clases.${clase}`) || clase;
  const clasesDisponibles = corpus?.clases ?? [];
  const isClaseSel = (clase: string) => clasesSel === null || clasesSel.includes(clase);
  const toggleClaseSel = (clase: string) => {
    const all = clasesDisponibles.map((c) => c.clase);
    const current = clasesSel === null ? all : clasesSel;
    const next = current.includes(clase) ? current.filter((c) => c !== clase) : [...current, clase];
    if (next.length === 0) return; // siempre al menos una clase considerada
    const value = next.length === all.length ? null : next; // todas → null (estado limpio)
    setClasesSel(value);
    writeClasesSel(value);
  };
  // Leyenda de cabecera: nº de clases consideradas y documentos que suman.
  const consideradas = clasesDisponibles.filter((c) => isClaseSel(c.clase));
  const nClasesConsideradas = consideradas.length;
  const nDocsConsiderados = consideradas.reduce((s, c) => s + c.count, 0);

  return (
    <>
      {/* Handle colapsado: borde derecho, vertical */}
      {!open && (
        <>
          {/* #1 — globo de onboarding para primer acceso, descartable.
              pointer-events-none en el contenedor: es un HINT, no debe interceptar
              los clicks de los elementos que quedan debajo (rompía interacciones
              reales y los e2e). El botón "Entendido" reactiva pointer-events. */}
          {showOnboard && (
            <div className="pointer-events-none fixed right-12 top-1/2 z-40 w-64 -translate-y-1/2 rounded-lg border border-cyan-200 bg-white p-3 shadow-xl print:hidden">
              <div
                className="absolute right-[-6px] top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border-r border-t border-cyan-200 bg-white"
                aria-hidden
              />
              <p className="text-sm font-semibold text-cyan-800">{t("ui.mycobot.onboardTitle")}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-gray-600">{t("ui.mycobot.onboardBody")}</p>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={dismissOnboard}
                  className="pointer-events-auto rounded px-2 py-1 text-[12px] font-medium text-gray-500 hover:bg-gray-100"
                >
                  {t("ui.mycobot.onboardDismiss")}
                </button>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              dismissOnboard();
              setOpenPersisted(true);
            }}
            aria-label={t("ui.mycobot.railAria")}
            title={t("ui.mycobot.title")}
            className="fixed right-0 top-1/2 z-40 flex -translate-y-1/2 items-center gap-1 rounded-l-lg bg-cyan-600 py-3 pl-2 pr-1.5 text-white shadow-lg transition-colors hover:bg-cyan-700 print:hidden"
          >
            <Sparkles className="h-4 w-4" />
          </button>
        </>
      )}

      {/* Panel abierto: rail lateral derecho (o expandido a pantalla completa), no modal */}
      {open && (
        <aside
          className={cn(
            "fixed top-0 z-[70] flex h-full flex-col border-l bg-white shadow-2xl transition-[left,max-width] duration-200 print:hidden",
            expanded
              ? cn(
                  // Expandido: ocupa todo salvo el sidebar izquierdo (que respeta su
                  // ancho según esté desplegado (220px) o compacto (64px)).
                  "left-0 right-0 w-auto max-w-none",
                  collapsed ? "lg:left-[64px]" : "lg:left-[220px]",
                )
              : "right-0 w-full max-w-[380px]",
          )}
        >
          <header className="flex items-center gap-2 border-b bg-cyan-600 px-4 py-3 text-white">
            <Sparkles className="h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">{t("ui.mycobot.title")}</p>
              <p className="text-[11px] leading-tight text-cyan-100">{t("ui.mycobot.subtitle")}</p>
            </div>
            {/* #563(b) — expandir / contraer el panel del chat. */}
            <button
              type="button"
              onClick={toggleExpanded}
              aria-label={expanded ? t("ui.mycobot.minimize") : t("ui.mycobot.expand")}
              title={expanded ? t("ui.mycobot.minimize") : t("ui.mycobot.expand")}
              className="hidden rounded p-1 hover:bg-white/10 lg:block"
            >
              {expanded ? <Minimize2 className="h-[18px] w-[18px]" /> : <Maximize2 className="h-[18px] w-[18px]" />}
            </button>
            {/* En modo expandido la lista de conversaciones vive a la izquierda: el
                botón de historial de la cabecera sería redundante. */}
            {!expanded && (
              <button
                type="button"
                onClick={() => (view === "history" ? setView("chat") : void openHistory())}
                aria-label={t("ui.mycobot.history")}
                title={t("ui.mycobot.history")}
                className={`rounded p-1 hover:bg-white/10 ${view === "history" ? "bg-white/15" : ""}`}
              >
                <History className="h-[18px] w-[18px]" />
              </button>
            )}
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

          {/* Cuerpo: en modo expandido, columna izquierda con la lista de
              conversaciones + columna derecha (saldo, fuentes y chat/visor). En modo
              normal solo existe la columna derecha, a todo el ancho del rail. */}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {expanded && (
              <div className="hidden w-64 shrink-0 flex-col border-r bg-gray-50/70 md:flex">
                <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
                  <History className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <span className="flex-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {t("ui.mycobot.conversations")}
                  </span>
                  <button
                    type="button"
                    onClick={newConversation}
                    aria-label={t("ui.mycobot.newConversation")}
                    title={t("ui.mycobot.newConversation")}
                    className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                  >
                    <PlusCircle className="h-4 w-4" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                  {historyLoading && (
                    <div className="flex items-center gap-2 px-1 py-6 text-sm text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("ui.mycobot.thinking")}
                    </div>
                  )}
                  {!historyLoading && conversaciones && conversaciones.length === 0 && (
                    <p className="px-1 py-6 text-center text-xs text-gray-500">{t("ui.mycobot.noHistory")}</p>
                  )}
                  {!historyLoading && conversaciones && conversaciones.length > 0 && (
                    <ul className="space-y-1">
                      {conversaciones.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => void loadConversation(c.id)}
                            className={`w-full rounded-md px-2.5 py-2 text-left hover:bg-gray-200/70 ${
                              c.id === conversacionId ? "bg-cyan-100/70" : ""
                            }`}
                          >
                            <span className="block truncate text-[13px] text-gray-800">{c.titulo}</span>
                            <span className="mt-0.5 block text-[11px] text-gray-400">
                              {new Date(c.updatedAt).toLocaleDateString()} · {t("ui.mycobot.turnos", { n: c.turnos })}
                              {c.esTelegram && (
                                <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-sky-100 px-1 align-middle font-medium text-sky-700">
                                  <Send className="h-2.5 w-2.5" />
                                  Telegram
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">

          {/* Saldo del monedero de créditos de IA. Solo si la org tiene doctrina
              (Consultor): es lo que consume créditos. Sin doctrina, MycoBot solo
              da ayuda de producto (gratis) → no tiene sentido mostrar saldo. */}
          {wallet && corpus?.hasDoctrina && (
            <div
              className={`border-b px-4 py-1.5 text-xs font-medium ${
                wallet.blocked ? "bg-red-50 text-red-700" : "bg-cyan-50 text-cyan-800"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Coins className="h-3.5 w-3.5" />
                <span>{t("ui.billing.creditsBalance", { n: String(wallet.total) })}</span>
              </div>
              {/* Progreso hacia el próximo crédito: el chat se factura por tokens y
                  gasta 1 crédito cada ~decenas de mensajes. Esta barra hace visible
                  ese consumo acumulado (0→100%) para que no parezca "gratis" ni
                  sorprenda el cargo. Solo si hay algo acumulado y no está bloqueado. */}
              {!wallet.blocked && wallet.nextCreditProgress > 0 && (
                <div className="mt-1 flex items-center gap-1.5">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-cyan-100">
                    <div
                      className="h-full rounded-full bg-cyan-500 transition-all"
                      style={{ width: `${Math.round(wallet.nextCreditProgress * 100)}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-[10px] font-normal text-cyan-700">
                    {t("ui.billing.nextCreditProgress", {
                      pct: String(Math.round(wallet.nextCreditProgress * 100)),
                    })}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Clases de la Biblioteca que MycoBot está considerando (solo si la org
              tiene Consultor). Toda la leyenda —y el icono de la derecha— abren el
              modal /sources para editar la selección. */}
          {corpus?.hasDoctrina && (
            <button
              type="button"
              onClick={() => {
                setClasesSel(readClasesSel());
                setSourcesOpen(true);
              }}
              title={t("ui.mycobot.sourcesOpen")}
              className="flex w-full items-center gap-1.5 border-b bg-cyan-50 px-4 py-1.5 text-[11px] text-cyan-800 hover:bg-cyan-100"
            >
              <Scale className="h-3.5 w-3.5 shrink-0 text-cyan-600" />
              <span className="flex-1 text-left">
                {t("ui.mycobot.sourcesBadge", {
                  clases: String(nClasesConsideradas),
                  docs: nDocsConsiderados.toLocaleString(),
                })}
              </span>
              <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-cyan-600" />
            </button>
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
                          {c.esTelegram && (
                            <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-sky-100 px-1 align-middle font-medium text-sky-700">
                              <Send className="h-2.5 w-2.5" />
                              Telegram
                            </span>
                          )}
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
                        // se muestra el mensaje i18n fijo en vez del texto del backend. Las
                        // marcas [n] se convierten en anclas clicables (delegación de click).
                        <div
                          className="leading-relaxed [&_a]:text-cyan-700 [&_a]:underline [&_.cita-ref]:cursor-pointer [&_.cita-ref]:font-mono [&_.cita-ref]:font-semibold [&_.cita-ref]:no-underline [&_code]:rounded [&_code]:bg-gray-200 [&_code]:px-1 [&_h1]:text-sm [&_h1]:font-bold [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:mt-0.5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4"
                          onClick={(e) => {
                            const el = (e.target as HTMLElement).closest("a.cita-ref");
                            if (!el) return;
                            e.preventDefault();
                            const idx = Number(el.getAttribute("data-cita"));
                            if (m.citas && Number.isInteger(idx)) goToCita(m.citas, idx);
                          }}
                          dangerouslySetInnerHTML={{
                            __html: linkifyCitas(
                              renderMarkdown(m.skill === "fuera" ? t("ui.mycobot.outOfScope") : m.text),
                              m.citas?.length ?? 0,
                            ),
                          }}
                        />
                      ) : (
                        <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                      )}
                      {m.role === "bot" && !m.error && m.skill !== "fuera" && m.text && (
                        <div className="mt-1.5 flex justify-end">
                          <button
                            type="button"
                            onClick={() => copyAnswer(i, m.text)}
                            className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600"
                            title={t("ui.mycobot.copy")}
                            aria-label={t("ui.mycobot.copy")}
                          >
                            {copiedIdx === i ? (
                              <>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                {t("ui.mycobot.copied")}
                              </>
                            ) : (
                              <>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                                {t("ui.mycobot.copy")}
                              </>
                            )}
                          </button>
                        </div>
                      )}
                      {m.role === "bot" && !m.error && m.steps && m.steps.length > 0 && (
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() =>
                              setOpenProcess((s) => {
                                const n = new Set(s);
                                if (n.has(i)) n.delete(i);
                                else n.add(i);
                                return n;
                              })
                            }
                            className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600"
                          >
                            {openProcess.has(i) ? "▾ Ocultar proceso" : `▸ Ver proceso · ${m.steps.length} pasos`}
                          </button>
                          {openProcess.has(i) && (
                            <ol className="mt-1 space-y-1 border-l-2 border-gray-200 pl-2">
                              {m.steps.map((s, k) => (
                                <li key={k} className="text-[11px] leading-snug">
                                  <span className={s.error ? "text-red-500" : "text-gray-600"}>{s.label}</span>
                                  {s.hint && <span className="text-gray-400"> · {s.hint}</span>}
                                  {s.query && (
                                    <span className="block truncate italic text-gray-400">“{s.query}”</span>
                                  )}
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
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
                              // #548 — badge de la CLASE citada (icono + color + etiqueta corta).
                              const ClaseIcon = (c.clase && CLASE_ICON[c.clase]) || Scale;
                              const claseCorto = c.clase ? t(`ui.mycobot.clasesCorto.${c.clase}`) || c.clase : "";
                              const inner = (
                                <span className="flex items-start gap-1.5">
                                  <span className="min-w-0">
                                    <span className="flex flex-wrap items-center gap-1">
                                      {c.clase ? (
                                        <span
                                          className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] leading-none ${
                                            CLASE_COLOR[c.clase] ?? "bg-gray-100 text-gray-600"
                                          }`}
                                        >
                                          <ClaseIcon className="h-2.5 w-2.5 shrink-0" />
                                          {claseCorto}
                                        </span>
                                      ) : (
                                        <Scale className="h-3 w-3 shrink-0 text-cyan-600" />
                                      )}
                                      <span className="font-mono text-[11px] text-cyan-700">
                                        [{j + 1}] {label}
                                      </span>
                                      {/* #2 — fecha de la resolución citada, visible ANTES de pinchar
                                          (mismo formato que el visor de la ficha). */}
                                      {c.fecha && (
                                        <span className="text-[10px] tabular-nums text-gray-400">
                                          {new Date(c.fecha).toLocaleDateString()}
                                        </span>
                                      )}
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
                                    // Dentro de Consultor: navega a la sección de Resoluciones y
                                    // colapsa el rail (el hilo queda persistido en sessionStorage y
                                    // se rehidrata tras la recarga). `setOpenPersisted(false)` corre
                                    // síncrono antes de la navegación full-page.
                                    // #2 — pasamos la lista ORDENADA de fuentes citadas (`fuentes`)
                                    // y el índice de esta (`fi`) para que la ficha ofrezca navegación
                                    // «anterior/siguiente fuente» sin tener que volver a MycoBot.
                                    <a
                                      href={`/resoluciones/${c.resolucionId}?fuentes=${encodeURIComponent(
                                        m.citas!.map((x) => x.resolucionId).join(","),
                                      )}&fi=${j}`}
                                      className={cls}
                                      onClick={() => setOpenPersisted(false)}
                                    >
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
                  <div className="flex items-start gap-2 px-1 text-sm text-gray-500">
                    <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                    {stepLive ? (
                      // Línea viva: el paso en curso (se sustituye por el siguiente).
                      <span className="min-w-0">
                        <span className={stepLive.error ? "text-red-500" : ""}>{stepLive.label}</span>
                        {stepLive.hint && <span className="text-gray-400"> · {stepLive.hint}</span>}
                        {stepLive.query && (
                          <span className="block truncate text-[12px] italic text-gray-400">“{stepLive.query}”</span>
                        )}
                      </span>
                    ) : (
                      <span>{t("ui.mycobot.thinking")}</span>
                    )}
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
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void ask(input);
                      }
                    }}
                    rows={1}
                    placeholder={t("ui.mycobot.placeholder")}
                    aria-label={t("ui.mycobot.placeholder")}
                    // #563(a) — `overflow-y-auto` + max-height activa el scroll interno
                    // una vez alcanzada la altura máxima; la altura la fija el efecto
                    // de auto-grow (inputRef) según el contenido.
                    className="max-h-[160px] min-h-[40px] flex-1 resize-none overflow-y-auto rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
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
            </div>
          </div>
        </aside>
      )}

      {/* Modal de Fuentes del corpus (fuentes + clases, dos niveles). Es el mismo
          que abren el comando /sources y el badge de cabecera; la selección se
          guarda en las cookies compartidas mc_biblioteca_fuentes + mc_biblioteca_clases. */}
      <FuentesModal
        open={sourcesOpen}
        onClose={() => setSourcesOpen(false)}
        fuentesUrl={`${baseUrl}/fuentes`}
      />
    </>
  );
}
