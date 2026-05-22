"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, ChevronRight, Send, Loader2, ExternalLink, Scale } from "lucide-react";
import { useI18n } from "../i18n/i18n-context";

// Cita devuelta por el backend (AskResult.citas de consultor).
interface Cita {
  resolucionId: string;
  ordinal: number;
  referenciaBoe: string | null;
  fecha: string | null;
  titulo: string | null;
}

interface Msg {
  role: "user" | "bot";
  text: string;
  citas?: Cita[];
  sinResultado?: boolean;
  error?: boolean;
}

interface MycoBotRailProps {
  /** Gate: si la org no tiene Consultor, el rail NO se renderiza. */
  available?: boolean;
  /** Endpoint POST {pregunta} → { data: { respuesta, citas, sinResultado } }. */
  askUrl?: string;
  /**
   * Base URL de Consultor para deep-link de citas (`${consultorUrl}/resoluciones/[id]`).
   * Pasar `""` cuando el rail se monta DENTRO de Consultor → enlaces relativos.
   * `undefined` → las citas se muestran sin enlace.
   */
  consultorUrl?: string;
}

const OPEN_STORAGE_KEY = "mycolegal:mycobot:open";

/**
 * Rail de chat de MycoBot (asistente de resoluciones). Colapsado por defecto
 * como un handle/chevron pegado al borde derecho; se abre con el chevron o con
 * el evento `mycolegal:open-mycobot` (detail.pregunta opcional) que dispara la
 * paleta de comandos. No es modal: la app sigue usable mientras está abierto.
 *
 * Se monta UNA vez en el app-shell de cada app (como <IncidentReporter/>), con
 * `available` calculado server-side a partir de las apps de la org.
 */
export function MycoBotRail({ available = false, askUrl = "/api/resoluciones/ask", consultorUrl }: MycoBotRailProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

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
      setInput("");
      setMessages((m) => [...m, { role: "user", text: q }]);
      setLoading(true);
      try {
        const res = await fetch(askUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pregunta: q }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg =
            res.status === 429
              ? json?.error?.message || t("ui.mycobot.rateLimited")
              : t("ui.mycobot.error");
          setMessages((m) => [...m, { role: "bot", text: msg, error: true }]);
          return;
        }
        const data = json.data ?? {};
        setMessages((m) => [
          ...m,
          { role: "bot", text: data.respuesta ?? "", citas: data.citas ?? [], sinResultado: !!data.sinResultado },
        ]);
      } catch {
        setMessages((m) => [...m, { role: "bot", text: t("ui.mycobot.error"), error: true }]);
      } finally {
        setLoading(false);
      }
    },
    [askUrl, loading, t],
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
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  if (!available) return null;

  const citationHref = (c: Cita) =>
    consultorUrl !== undefined
      ? `${consultorUrl.replace(/\/$/, "")}/resoluciones/${c.resolucionId}`
      : undefined;

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
            <Sparkles className="h-4 w-4" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">{t("ui.mycobot.title")}</p>
              <p className="text-[11px] leading-tight text-cyan-100">{t("ui.mycobot.subtitle")}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpenPersisted(false)}
              aria-label={t("ui.mycobot.collapse")}
              className="rounded p-1 hover:bg-white/10"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </header>

          <div ref={threadRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <p className="px-1 py-6 text-center text-sm text-gray-500">{t("ui.mycobot.emptyHint")}</p>
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
                  <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                  {m.role === "bot" && m.citas && m.citas.length > 0 && (
                    <div className="mt-2 border-t border-gray-200 pt-2">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                        {t("ui.mycobot.sources")}
                      </p>
                      <ul className="space-y-1">
                        {m.citas.map((c, j) => {
                          const href = citationHref(c);
                          const label = c.referenciaBoe || `#${c.ordinal}`;
                          const inner = (
                            <span className="flex items-start gap-1.5">
                              <Scale className="mt-0.5 h-3 w-3 shrink-0 text-cyan-600" />
                              <span className="min-w-0">
                                <span className="font-mono text-[11px] text-cyan-700">[{j + 1}] {label}</span>
                                {c.titulo && <span className="block truncate text-[11px] text-gray-500">{c.titulo}</span>}
                              </span>
                              {href && <ExternalLink className="ml-auto mt-0.5 h-3 w-3 shrink-0 text-gray-400" />}
                            </span>
                          );
                          return (
                            <li key={c.resolucionId + j}>
                              {href ? (
                                <a href={href} target="_blank" rel="noopener noreferrer" className="block rounded px-1 py-0.5 hover:bg-gray-200">
                                  {inner}
                                </a>
                              ) : (
                                <span className="block px-1 py-0.5">{inner}</span>
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
        </aside>
      )}
    </>
  );
}
