"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, LayoutGrid, Loader2 } from "lucide-react";
import type { AppInfo } from "./app-info";
import { SidebarFlyout } from "./sidebar-flyout";
import { useI18n } from "../i18n/i18n-context";

interface MyAppsSectionProps {
  apps: AppInfo[];
  /** Slug of the currently active app — filtered out of the list. */
  currentSlug?: string;
  /** Optional override for the section label. */
  label?: string;
}

/**
 * Letras aceleradoras estables por slug. Las apps que no estén en este
 * mapa caen al fallback (primera letra alfanumérica libre escaneando el
 * nombre). Si añades una app aquí elige una letra que no colisione.
 */
const STABLE_ACCELS: Record<string, string> = {
  actas: "a",
  admin: "i",
  archivo: "r",
  cancelaciones: "c",
  consultor: "o",
  docfilling: "d",
  facturae: "f",
  legifirma: "l",
  moratorias: "m",
  notaria: "n",
  peticiones: "p",
  tributos: "t",
};

interface AppWithAccel extends AppInfo {
  /** Lowercase letter that activates this app, or null if no accel could be assigned. */
  accelChar: string | null;
}

function assignAccels(apps: AppInfo[]): AppWithAccel[] {
  const used = new Set<string>();
  const result: AppWithAccel[] = new Array(apps.length);
  const needsFallback: number[] = [];

  // Pasada 1: apps con letra estable en el mapa.
  apps.forEach((app, i) => {
    const stable = STABLE_ACCELS[app.slug.toLowerCase()];
    if (stable && !used.has(stable)) {
      used.add(stable);
      result[i] = { ...app, accelChar: stable };
    } else {
      needsFallback.push(i);
    }
  });

  // Pasada 2: fallback para apps no mapeadas (o cuya letra estable colisiona).
  for (const i of needsFallback) {
    const app = apps[i];
    let chosen: string | null = null;
    for (let j = 0; j < app.name.length; j++) {
      const ch = app.name[j].toLowerCase();
      if (/[a-z0-9]/.test(ch) && !used.has(ch)) {
        used.add(ch);
        chosen = ch;
        break;
      }
    }
    result[i] = { ...app, accelChar: chosen };
  }

  return result;
}

const INPUT_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function isTypingInInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (INPUT_TAGS.has(target.tagName)) return true;
  if (target.isContentEditable) return true;
  return false;
}

function detectMac(): boolean {
  if (typeof navigator === "undefined") return false;
  const src = navigator.platform || navigator.userAgent || "";
  return /Mac|iPhone|iPad/.test(src);
}

function formatCombo(letter: string, isMac: boolean): string {
  const L = letter.toUpperCase();
  return isMac ? `⌘⌥⇧${L}` : `Ctrl+Alt+Shift+${L}`;
}

/**
 * "Mis aplicaciones" sidebar block. Opens as a flyout panel to the right of
 * the sidebar; cada app muestra un chip con su atajo de teclado a la derecha.
 *
 * Atajo global:
 *  - Mac:        ⌘ + ⌥ + ⇧ + <letra>
 *  - Windows:    Ctrl + Alt + Shift + <letra>
 * Los tres modificadores son intencionales: evitan choques con atajos del
 * navegador (⌘K palette, ⌘⇧T reabrir pestaña, ⌘R recargar, …) y con el OS.
 * El listener es global, no requiere abrir el flyout para funcionar.
 */
export function MyAppsSection({ apps, currentSlug, label }: MyAppsSectionProps) {
  const { t } = useI18n();
  const resolvedLabel = label ?? t("ui.myApps.label");
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => setIsMac(detectMac()), []);

  const otherApps = useMemo(
    () => apps.filter((a) => a.slug !== currentSlug),
    [apps, currentSlug],
  );
  const accelApps = useMemo(() => assignAccels(otherApps), [otherApps]);
  const accelMap = useMemo(() => {
    const map = new Map<string, AppWithAccel>();
    for (const app of accelApps) {
      if (app.accelChar) map.set(app.accelChar, app);
    }
    return map;
  }, [accelApps]);

  function navigate(app: AppInfo) {
    if (navigatingTo) return;
    setNavigatingTo(app.slug);
    setOpen(false);
    window.location.href = app.appUrl;
  }

  // Atajo global con tres modificadores. Mac usa Cmd (metaKey); Windows/Linux
  // usan Ctrl (ctrlKey). En ambas plataformas exigimos Alt + Shift adicionales
  // para que el combo sea único y no pise atajos del navegador ni del OS.
  useEffect(() => {
    if (accelMap.size === 0) return;
    function onKey(e: KeyboardEvent) {
      if (!e.altKey || !e.shiftKey) return;
      // Exigimos exactamente Cmd ó Ctrl (no ambos, no ninguno).
      if (e.metaKey === e.ctrlKey) return;
      if (e.key.length !== 1) return;
      if (isTypingInInput(e.target)) return;
      const ch = e.key.toLowerCase();
      const match = accelMap.get(ch);
      if (!match) return;
      e.preventDefault();
      navigate(match);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accelMap]);

  if (otherApps.length === 0) return null;

  return (
    <>
      <SidebarFlyout
        ariaLabel={resolvedLabel}
        open={open}
        onOpenChange={setOpen}
        icon={<LayoutGrid className="h-4 w-4 shrink-0" />}
        trigger={
          <>
            <LayoutGrid className="h-4 w-4 shrink-0" />
            {resolvedLabel}
            <ChevronRight className="ml-auto h-4 w-4" />
          </>
        }
      >
        <div className="px-2 pb-1 pt-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
            {resolvedLabel}
          </p>
        </div>
        {accelApps.map((app) => {
          const isNavigating = navigatingTo === app.slug;
          const combo = app.accelChar ? formatCombo(app.accelChar, isMac) : null;
          return (
            <button
              key={app.slug}
              type="button"
              onClick={() => navigate(app)}
              disabled={!!navigatingTo}
              title={
                combo
                  ? t("ui.myApps.appShortcutTitle", { name: app.name, combo })
                  : app.name
              }
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <AppLogo app={app} />
              <span className="min-w-0 flex-1 truncate text-left">{app.name}</span>
              {isNavigating ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-cyan-400" />
              ) : combo ? (
                <kbd className="shrink-0 rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] font-normal tracking-tight text-white/50">
                  {combo}
                </kbd>
              ) : null}
            </button>
          );
        })}
      </SidebarFlyout>
      {navigatingTo && <AppNavigatingOverlay />}
    </>
  );
}

function AppLogo({ app }: { app: AppInfo }) {
  const initials = app.name.slice(0, 2).toUpperCase();
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded bg-white/10 text-[10px] font-bold uppercase text-white/70">
      {app.logoSvg ? (
        <div
          className="h-5 w-5 [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: app.logoSvg }}
        />
      ) : (
        initials
      )}
    </div>
  );
}

function AppNavigatingOverlay() {
  const { t } = useI18n();
  if (typeof document === "undefined") return null;
  // Portaleamos a body porque el <aside> del sidebar tiene `transform`
  // (translate-x-0 en lg, -translate-x-full en mobile), lo que crea un
  // containing block para position:fixed y "atrapa" el overlay dentro
  // de los 220px del sidebar.
  return createPortal(
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-3 rounded-lg bg-white px-6 py-5 shadow-xl">
        <Loader2 className="h-7 w-7 animate-spin text-cyan-600" />
        <p className="text-sm font-medium text-gray-700">{t("ui.myApps.loadingApp")}</p>
      </div>
    </div>,
    document.body,
  );
}
