"use client";

import { useEffect, useRef, useState } from "react";
import { HelpCircle, PlayCircle, BookOpen, Sparkles, Bug } from "lucide-react";
import { NavLink as Link } from "./nav-link";
import { useI18n } from "../i18n/i18n-context";

// #559 — "Centro de ayuda" del toolbar. Sustituye al enlace directo al Manual
// por un menú con las vías de ayuda siempre disponibles. Todo se dispara por
// eventos globales que ya escuchan los componentes montados en el app-shell:
//   · "mycolegal:open-firstrun"          → <FirstRunWelcome> (relanza el tour)
//   · "mycolegal:open-mycobot"           → <MycoBotRail>      (pregunta a la IA)
//   · "mycolegal:open-incident-reporter" → <IncidentReporter> (reportar incidencia)
// El Manual es un enlace normal. Cada app activa las entradas que tenga montadas.

interface HelpMenuProps {
  /** Destino del Manual (por defecto /manual). */
  manualHref?: string;
  /** "Ver la introducción" — requiere <FirstRunWelcome> montado. */
  showIntro?: boolean;
  /** "Preguntar a la IA" — requiere <MycoBotRail> montado. */
  showAsk?: boolean;
  /** "Reportar una incidencia" — requiere <IncidentReporter> montado. */
  showReport?: boolean;
}

const ITEM =
  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-gray-700 hover:bg-gray-50";

export function HelpMenu({ manualHref = "/manual", showIntro = true, showAsk = false, showReport = false }: HelpMenuProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function fire(evt: string) {
    window.dispatchEvent(new CustomEvent(evt));
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t("ui.header.helpAria")}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded text-white/70 hover:bg-white/10 hover:text-white"
      >
        <HelpCircle className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 w-60 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-xl"
        >
          {showIntro && (
            <button type="button" role="menuitem" onClick={() => fire("mycolegal:open-firstrun")} className={ITEM}>
              <PlayCircle className="h-4 w-4 shrink-0 text-cyan-600" />
              {t("ui.header.helpMenuIntro")}
            </button>
          )}
          <Link href={manualHref} onClick={() => setOpen(false)} role="menuitem" className={ITEM}>
            <BookOpen className="h-4 w-4 shrink-0 text-gray-500" />
            {t("ui.header.helpMenuManual")}
          </Link>
          {showAsk && (
            <button type="button" role="menuitem" onClick={() => fire("mycolegal:open-mycobot")} className={ITEM}>
              <Sparkles className="h-4 w-4 shrink-0 text-cyan-600" />
              {t("ui.header.helpMenuAsk")}
            </button>
          )}
          {showReport && (
            <button type="button" role="menuitem" onClick={() => fire("mycolegal:open-incident-reporter")} className={ITEM}>
              <Bug className="h-4 w-4 shrink-0 text-gray-500" />
              {t("ui.header.helpMenuReport")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
