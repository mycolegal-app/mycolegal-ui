"use client";

import type { ReactNode } from "react";
import {
  AlarmClock, AlertTriangle, CheckCircle2, FileSignature, Send, Receipt,
  Trash2, Archive, ShieldCheck, Inbox, Clock, type LucideIcon,
} from "lucide-react";
import { NavLink as Link } from "./nav-link";

// Icono/color por SEMÁNTICA del estado (mismo lenguaje que el workspace de dominio).
// Se deriva de la clave + etiqueta ya resuelta, así funciona para cualquier consumidor
// sin conocer sus claves. Fallback neutro (Clock / gris).
function bucketMeta(key: string, label: string): { Icon: LucideIcon; tone: string } {
  const s = `${key} ${label}`.toLowerCase();
  if (/incid|rechaz/.test(s)) return { Icon: AlertTriangle, tone: "text-amber-700" };
  if (/valid/.test(s)) return { Icon: CheckCircle2, tone: "text-emerald-700" };
  if (/firma|matriz/.test(s)) return { Icon: FileSignature, tone: "text-emerald-700" };
  if (/remis|remit|envi|entrega|enviar|acuse/.test(s)) return { Icon: Send, tone: "text-gray-900" };
  if (/factur/.test(s)) return { Icon: Receipt, tone: "text-gray-900" };
  if (/anul/.test(s)) return { Icon: Trash2, tone: "text-gray-400" };
  if (/custodio|recepci|recepc/.test(s)) return { Icon: Archive, tone: "text-gray-900" };
  if (/autoriz|\baut\b/.test(s)) return { Icon: ShieldCheck, tone: "text-gray-900" };
  if (/recib|alta|pend.*env|env.*not/.test(s)) return { Icon: Inbox, tone: "text-gray-900" };
  return { Icon: Clock, tone: "text-gray-900" };
}

/**
 * Console "Estado de peticiones" compartido por las apps B2B internas
 * (Copias / Cancelaciones / Actas / Moratorias). Reproduce el esquema del menú
 * legacy (grupos de buckets + alarmas) en estilo mycolegal. Es PRESENTACIONAL:
 * cada app calcula sus buckets/contadores y pasa las etiquetas ya resueltas
 * (i18n) — el componente no conoce las claves de ninguna app.
 */

export interface ConsoleBucket {
  key: string;
  label: string;
  href: string;
  count: number;
}
export interface ConsoleGroup {
  key: string;
  title: string;
  buckets: ConsoleBucket[];
}
export interface ConsoleAlarma {
  key: string;
  label: string;
  href: string;
  count: number;
}

export interface EstadoPeticionesConsoleProps {
  title: string;
  subtitle?: string;
  groups: ConsoleGroup[];
  alarmas?: ConsoleAlarma[];
  alarmasTitle?: string;
  loading?: boolean;
  errorText?: string | null;
  /** Toggle global/míos. Si `onMineChange` es undefined, no se muestra. */
  mine?: boolean;
  onMineChange?: (mine: boolean) => void;
  todosLabel?: string;
  miosLabel?: string;
  /** Acción primaria (p.ej. "Nueva petición"). */
  newHref?: string;
  newLabel?: string;
  newIcon?: ReactNode;
}

export function EstadoPeticionesConsole({
  title,
  subtitle,
  groups,
  alarmas = [],
  alarmasTitle = "Alarmas",
  loading = false,
  errorText = null,
  mine = false,
  onMineChange,
  todosLabel = "Todos",
  miosLabel = "Míos",
  newHref,
  newLabel,
  newIcon,
}: EstadoPeticionesConsoleProps) {
  return (
    <div className="p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="mb-1 text-2xl font-semibold text-gray-900">{title}</h1>
            {subtitle ? <p className="text-sm text-gray-500">{subtitle}</p> : null}
          </div>
          <div className="flex items-center gap-3">
            {onMineChange ? (
              <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 text-sm">
                <button
                  type="button"
                  onClick={() => onMineChange(false)}
                  className={`px-3 py-2 font-medium ${!mine ? "bg-mc-slate-700 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                >
                  {todosLabel}
                </button>
                <button
                  type="button"
                  onClick={() => onMineChange(true)}
                  className={`px-3 py-2 font-medium ${mine ? "bg-mc-slate-700 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                >
                  {miosLabel}
                </button>
              </div>
            ) : null}
            {newHref && newLabel ? (
              <Link
                href={newHref}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-mc-slate-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-mc-slate-900"
              >
                {newIcon}
                {newLabel}
              </Link>
            ) : null}
          </div>
        </div>

        {errorText ? (
          <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{errorText}</div>
        ) : null}

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => {
            const groupTotal = g.buckets.reduce((acc, b) => acc + b.count, 0);
            return (
              <section key={g.key} className="rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{g.title}</span>
                  <span className="tabular-nums text-xs font-semibold text-gray-500">{loading ? "…" : groupTotal}</span>
                </div>
                <ul className="divide-y divide-gray-50">
                  {g.buckets.map((b) => {
                    const { Icon, tone } = bucketMeta(b.key, b.label);
                    return (
                      <li key={b.key}>
                        <Link
                          href={b.href}
                          className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-50"
                        >
                          <span className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-gray-400" />
                            {b.label}
                          </span>
                          <span className={`tabular-nums font-semibold ${tone}`}>
                            {loading ? <span className="inline-block h-4 w-6 animate-pulse rounded bg-gray-100" /> : b.count}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>

        {alarmas.length > 0 ? (
          <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50/40 shadow-sm">
            <h2 className="flex items-center gap-2 border-b border-amber-100 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-amber-700">
              <AlarmClock className="h-4 w-4" />
              {alarmasTitle}
            </h2>
            <ul className="divide-y divide-amber-100/60">
              {alarmas.map((a) => (
                <li key={a.key}>
                  <Link
                    href={a.href}
                    className="flex items-center justify-between px-5 py-3 text-sm text-amber-900 transition-colors hover:bg-amber-50"
                  >
                    <span>{a.label}</span>
                    <span className="tabular-nums font-semibold text-amber-900">{loading ? "…" : a.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
