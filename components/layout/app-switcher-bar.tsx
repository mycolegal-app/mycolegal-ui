"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import type { AppInfo } from "./app-info";
import { SubscribeAppModal, type SubscribableApp } from "./subscribe-app-modal";
import { useI18n } from "../i18n/i18n-context";
import { cn } from "../../lib/utils";

interface AppSwitcherBarProps {
  apps: AppInfo[];
  /** Slug of the current app — highlighted, not navigated to on click. */
  currentSlug: string;
  /**
   * Apps que la org aún NO tiene concedidas. Se muestran en gris (solo al
   * org_admin, que es quien recibe esta lista desde user-apps). Al hacer clic se
   * abre un modal para contratarla en el sitio —o para registrar interés, si aún
   * es "Próximamente"—. Vacío ⇒ no se muestra nada (una org con todo concedido no
   * ve nada gris).
   */
  unsubscribedApps?: SubscribableApp[];
  /** Destino de suscripción (Config → /suscripcion). Fallback del modal. */
  subscribeUrl?: string | null;
}

const STORAGE_KEY = "mc:app-switcher:open";
const HOVER_EXPAND_DELAY_MS = 150;
const UNREAD_POLL_MS = 60_000;

/**
 * Hook: nº de notificaciones no leídas por app para el usuario actual. Se sirve
 * del catch-all `/api/notifications` que montan todas las apps (proxya a auth
 * `GET /notifications/unread-by-app`). Refresca al montar, al recuperar el foco
 * de la pestaña y cada 60 s. Un fallo se traga (los badges son cosméticos).
 */
function useUnreadByApp(): Record<string, number> {
  const [byApp, setByApp] = useState<Record<string, number>>({});
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    async function load() {
      try {
        const res = await fetch("/api/notifications/unread-by-app");
        if (!res.ok) return;
        const json = await res.json();
        if (alive) setByApp((json?.byApp ?? {}) as Record<string, number>);
      } catch {
        /* silencioso */
      }
    }
    function onVisible() {
      if (document.visibilityState === "visible") load();
    }
    load();
    timer = setInterval(load, UNREAD_POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return byApp;
}

function UnreadBadge({ count }: { count: number }) {
  const { t } = useI18n();
  if (count <= 0) return null;
  return (
    <span
      aria-label={t("ui.appSwitcher.unread", { count })}
      className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-[#0f1b2d]"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * Subheader debajo del header estándar. Lista las apps habilitadas del usuario
 * como icono + nombre y permite saltar a cualquiera con un solo clic.
 *
 * Dos estados:
 *  - Expandido: fila de iconos+nombre sobre fondo claro.
 *  - Colapsado: cinta fina gris con un único chevron a la derecha; toda la
 *    cinta es clickable. No muestra ningún literal.
 *
 * El estado se persiste por usuario+dispositivo en localStorage.
 */
export function AppSwitcherBar({ apps, currentSlug, unsubscribedApps = [], subscribeUrl }: AppSwitcherBarProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  // App gris sobre la que se ha pulsado → modal de suscripción / interés.
  const [subscribing, setSubscribing] = useState<SubscribableApp | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unreadByApp = useUnreadByApp();
  const totalUnread = useMemo(
    () => Object.values(unreadByApp).reduce((a, b) => a + b, 0),
    [unreadByApp],
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === "0") setExpanded(false);
      else if (raw === "1") setExpanded(true);
    } catch {
      /* localStorage bloqueado (modo privado, etc.) — usamos el default */
    }
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const sortedApps = useMemo(
    () =>
      [...apps].sort((a, b) =>
        a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
      ),
    [apps],
  );

  // Apps vendibles no concedidas (grayed) — solo si hay destino de suscripción.
  const sortedUnsub = useMemo(
    () =>
      subscribeUrl
        ? [...unsubscribedApps].sort((a, b) =>
            a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
          )
        : [],
    [unsubscribedApps, subscribeUrl],
  );

  function persist(next: boolean) {
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  function expand() {
    setExpanded(true);
    persist(true);
  }

  function collapse() {
    setExpanded(false);
    persist(false);
  }

  function handleHoverEnter() {
    if (expanded || hoverTimerRef.current) return;
    hoverTimerRef.current = setTimeout(() => {
      hoverTimerRef.current = null;
      expand();
    }, HOVER_EXPAND_DELAY_MS);
  }

  function handleHoverLeave() {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }

  function navigate(app: AppInfo) {
    if (navigatingTo) return;
    if (app.slug === currentSlug) return;
    setNavigatingTo(app.slug);
    window.location.href = app.appUrl;
  }

  if (apps.length === 0 && sortedUnsub.length === 0) return null;

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={expand}
        onMouseEnter={handleHoverEnter}
        onMouseLeave={handleHoverLeave}
        aria-label={t("ui.appSwitcher.expand")}
        title={t("ui.appSwitcher.expand")}
        className="flex h-[18px] w-full shrink-0 items-center justify-end gap-2 border-b border-white/10 bg-[#0f1b2d] px-6 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
      >
        {totalUnread > 0 && (
          <span className="flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-white" />
      </button>
    );
  }

  return (
    <>
      <div
        role="navigation"
        aria-label={t("ui.appSwitcher.ariaLabel")}
        className="relative flex shrink-0 items-stretch border-b border-white/10 bg-[#0f1b2d]"
      >
        <div className="flex flex-1 items-stretch overflow-x-auto px-6 py-1">
          <div className="mx-auto flex w-fit items-stretch gap-1">
            {sortedApps.map((app) => {
              const isActive = app.slug === currentSlug;
              return (
                <button
                  key={app.slug}
                  type="button"
                  onClick={() => navigate(app)}
                  disabled={!!navigatingTo || isActive}
                  title={app.name}
                  className={cn(
                    "group flex w-[78px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-0.5 transition-colors",
                    isActive
                      ? "cursor-default"
                      : "hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60",
                  )}
                >
                  <div className="relative">
                    <AppLogo app={app} active={isActive} />
                    <UnreadBadge count={unreadByApp[app.slug] ?? 0} />
                  </div>
                  <span className="w-full text-center text-[10px] font-medium leading-tight text-white">
                    {app.name}
                  </span>
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="h-[2px] w-7 rounded-full bg-cyan-300"
                    />
                  )}
                </button>
              );
            })}

            {/* Apps vendibles no concedidas: en gris, con tooltip de suscripción. */}
            {sortedUnsub.length > 0 && (
              <span className="mx-1 w-px shrink-0 self-stretch bg-white/10" aria-hidden="true" />
            )}
            {sortedUnsub.map((app) => (
              <button
                key={`sell-${app.slug}`}
                type="button"
                onClick={() => setSubscribing(app)}
                title={
                  (app as SubscribableApp).sellable === false
                    ? "Próximamente — pulsa para que te avisemos"
                    : "Pulsa para suscribirte"
                }
                className="group flex w-[78px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-0.5 opacity-40 transition-opacity hover:opacity-75"
              >
                <div className="relative grayscale">
                  <AppLogo app={app} active={false} />
                </div>
                <span className="w-full text-center text-[10px] font-medium leading-tight text-white/70">
                  {app.name}
                </span>
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={collapse}
          aria-label={t("ui.appSwitcher.collapse")}
          title={t("ui.appSwitcher.collapse")}
          className="flex w-10 shrink-0 items-center justify-center border-l border-white/10 text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      </div>
      {navigatingTo && <AppNavigatingOverlay />}
      {subscribing && (
        <SubscribeAppModal
          app={subscribing}
          onClose={() => setSubscribing(null)}
          // Tras contratar, el OrgApp lo concede el webhook de Stripe (asíncrono):
          // recargamos para que la toolbar la pinte ya como concedida.
          onSubscribed={() => window.location.reload()}
        />
      )}
    </>
  );
}

function AppLogo({ app, active }: { app: AppInfo; active: boolean }) {
  const initials = app.name.slice(0, 2).toUpperCase();
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden">
      {app.logoSvg ? (
        <div
          className={cn(
            "h-7 w-7 transition-opacity [&>svg]:h-full [&>svg]:w-full",
            active ? "opacity-100" : "opacity-90 group-hover:opacity-100",
          )}
          dangerouslySetInnerHTML={{ __html: app.logoSvg }}
        />
      ) : (
        <span
          className={cn(
            "text-xs font-bold uppercase",
            active ? "text-white" : "text-white/80 group-hover:text-white",
          )}
        >
          {initials}
        </span>
      )}
    </div>
  );
}

function AppNavigatingOverlay() {
  const { t } = useI18n();
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-3 rounded-lg bg-white px-6 py-5 shadow-xl">
        <Loader2 className="h-7 w-7 animate-spin text-cyan-600" />
        <p className="text-sm font-medium text-gray-700">
          {t("ui.appSwitcher.loadingApp")}
        </p>
      </div>
    </div>,
    document.body,
  );
}
