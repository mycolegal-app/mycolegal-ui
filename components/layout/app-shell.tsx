"use client";

import { useState, useEffect, type ReactNode } from "react";
import { Menu, Coins } from "lucide-react";
import { PageHeaderProvider, usePageHeader } from "./page-header-context";
import { type AppInfo } from "./app-info";
import { IdleTimeout } from "./idle-timeout";
import { AppSwitcherBar } from "./app-switcher-bar";
import { AppInfoButton } from "../shared/app-info-button";
import { ImpersonationBanner } from "../shared/impersonation-banner";
import { BillingNoticeBanner, type BillingNotice } from "../shared/billing-notice-banner";
import { LegalGate } from "../shared/legal-gate";
import {
  DefaultHelpButton,
  DefaultSearchButton,
} from "../shared/header-default-buttons";
import { useAuthFetchGuard } from "../../hooks/use-auth-fetch-guard";
import { useIsOrgAdmin } from "../../hooks/use-is-org-admin";
import { CreditsPurchaseModal } from "../shared/credits-purchase-modal";
import { useI18n } from "../i18n/i18n-context";
import { cn } from "../../lib/utils";
import {
  SidebarCollapseProvider,
  useSidebarCollapse,
} from "./sidebar-collapse-context";

interface UserInfo {
  displayName: string;
  email: string;
  role: string;
}

interface OrgInfo {
  name: string;
  logo: string | null;
}

interface AppShellProps {
  children: ReactNode;
  /** App slug used to filter current app from the switcher */
  appSlug: string;
  /** Display name used by the header info modal (e.g. "Notaría"). */
  appName: string;
  /** Optional logo shown in the info modal. */
  appLogoUrl?: string;
  /** Sidebar component (app-specific nav) */
  sidebar: (props: {
    user: UserInfo;
    apps: AppInfo[];
    currentSlug: string;
    mobileOpen: boolean;
    onMobileClose: () => void;
  }) => ReactNode;
  /** Optional slots for the header right section */
  commandPalette?: ReactNode;
  helpButton?: ReactNode;
  /** Optional indicador del monedero de créditos de IA (p.ej. <CreditBalanceBadge/>). */
  creditBalance?: ReactNode;
  /** Optional breadcrumbs below header */
  breadcrumbs?: ReactNode;
  /** Optional overlays (help overlay, keyboard shortcuts, etc.) */
  overlays?: ReactNode;
  /** Wrapper providers (I18n, Help, etc.) — receives children to wrap */
  providers?: (children: ReactNode) => ReactNode;
  /** Render the AppSwitcherBar subheader (collapsible icon strip) below the
   *  main header. Replaces the sidebar "Mis aplicaciones" entry — apps that
   *  enable this should also pass `hideMyApps` to their AppSidebar. */
  showAppSwitcherBar?: boolean;
}

function AppShellInner({
  children,
  appName,
  appLogoUrl,
  org,
  commandPalette,
  helpButton,
  creditBalance,
  subscribeUrl,
  breadcrumbs,
  appSwitcherBar,
  impersonationBanner,
  billingNotices,
  onToggleMobile,
}: {
  children: ReactNode;
  appName: string;
  appLogoUrl?: string;
  org?: OrgInfo;
  commandPalette?: ReactNode;
  helpButton?: ReactNode;
  creditBalance?: ReactNode;
  subscribeUrl?: string | null;
  breadcrumbs?: ReactNode;
  appSwitcherBar?: ReactNode;
  impersonationBanner?: ReactNode;
  billingNotices?: ReactNode;
  onToggleMobile: () => void;
}) {
  const { t } = useI18n();
  const { header, registerActionsSlot } = usePageHeader();
  const { collapsed } = useSidebarCollapse();

  return (
    // h-screen (no min-h-screen) so the column has a bounded height. Together
    // with the outer wrapper's overflow-hidden, this is what makes <main>'s
    // own overflow-y-auto kick in instead of the body scrolling. Project rule:
    // pages must never scroll vertically — the inner element owns the scroll.
    // El margen izquierdo sigue el ancho del sidebar (220px ↔ 64px en compacto);
    // la transición lo mantiene sincronizado con el aside al plegar/desplegar.
    <div
      className={cn(
        // `min-w-0`: sin él, este flex item (`flex-1`) no encoge por debajo del
        // ancho intrínseco de su contenido, así que una fila/tabla ancha empuja
        // el área más allá del viewport y `<main overflow-x-hidden>` la recorta
        // en vez de dejar que el contenido se ajuste (o haga su propio scroll).
        // Con min-w-0 el contenido respeta el ancho disponible al plegar/desplegar.
        "flex flex-1 flex-col h-screen min-h-0 min-w-0 transition-[margin] duration-200",
        collapsed ? "lg:ml-[64px]" : "lg:ml-[220px]",
      )}
    >
      {impersonationBanner}
      {billingNotices}
      {appSwitcherBar}
      {header && (
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-navy-600/30 bg-navy-700 px-6">
          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={onToggleMobile}
            aria-label={t("ui.appShell.openMobileMenu")}
            className="mr-3 lg:hidden text-white/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 flex items-center gap-2.5">
            {header.icon && (
              <span className="shrink-0 text-white/90 [&>svg]:h-5 [&>svg]:w-5">
                {header.icon}
              </span>
            )}
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-white truncate leading-tight">
                {header.title}
              </h1>
              {header.subtitle && (
                <p className="text-xs text-navy-200 truncate">{header.subtitle}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0 ml-4">
            {/* Slot where <HeaderActions> portals its children. `empty:hidden`
                keeps the wrapper out of the flex when no consumer is mounted
                — preserves the original "no extra gap" layout. */}
            <div
              ref={registerActionsSlot}
              className="flex items-center gap-2 print:hidden empty:hidden"
            />
            {creditBalance}
            {commandPalette ?? <DefaultSearchButton />}
            {helpButton ?? <DefaultHelpButton />}
            <AppInfoButton appName={appName} appLogoUrl={appLogoUrl} />
            {/* Org info: nombre + saldo de créditos de IA debajo (monedero único
                de la org; se auto-oculta si la app no expone /api/credits/balance). */}
            {org?.name && <OrgBadge org={org} />}
          </div>
        </header>
      )}
      {breadcrumbs}
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-6">{children}</main>
    </div>
  );
}

function OrgBadge({ org }: { org: OrgInfo }) {
  const [errored, setErrored] = useState(false);
  const showImg = org.logo && !errored;
  return (
    <div className="flex items-center gap-2 pl-3 border-l border-white/15">
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={org.logo as string}
          alt={org.name}
          className="h-6 shrink-0 rounded object-contain"
          onError={() => setErrored(true)}
        />
      ) : (
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-white/15 text-xs font-bold text-white">
          {org.name.charAt(0).toUpperCase()}
        </div>
      )}
      {/* Nombre de la org (más pequeño para dejar sitio) con el saldo de créditos
          justo debajo. El saldo solo aparece si la app expone el monedero. */}
      <div className="hidden min-w-0 flex-col leading-tight xl:flex">
        <span className="truncate text-xs font-medium text-navy-100">{org.name}</span>
        <OrgCreditBalance />
      </div>
    </div>
  );
}

// Saldo del monedero único de créditos de IA de la org, bajo el nombre en la
// barra superior. Lee `/api/credits/balance` (proxy a platform en cada app); si
// la app no lo expone o falla, no renderiza nada. Para org_admin es un botón que
// abre el modal de compra de packs; para el resto, texto informativo.
function OrgCreditBalance() {
  const { t } = useI18n();
  const isOrgAdmin = useIsOrgAdmin();
  const [total, setTotal] = useState<number | null>(null);
  const [blocked, setBlocked] = useState(false);
  // Fracción [0,1) del crédito EN CURSO ya consumida (acumulador por tokens). El chat
  // mide por tokens y solo debita créditos enteros al cruzar; esto muestra el avance
  // dentro del crédito actual (antes solo estaba en el rail de MycoBot, no en la toolbar).
  const [progress, setProgress] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/credits/balance")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        if (typeof d.total === "number") {
          setTotal(d.total);
          setBlocked(Boolean(d.blocked));
          setProgress(typeof d.nextCreditProgress === "number" ? d.nextCreditProgress : 0);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (total === null) return null;

  const pct = Math.min(100, Math.max(0, Math.round(progress * 100)));

  const content = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] leading-tight",
        blocked ? "text-amber-300" : "text-navy-200",
      )}
      title={t(isOrgAdmin ? "ui.billing.buyCredits" : "ui.billing.credits")}
    >
      <Coins className="h-3 w-3 shrink-0" />
      <span className="truncate">{t("ui.billing.creditsBalance", { n: String(total) })}</span>
      {/* % del crédito en curso: barra fina + número. Solo si hay consumo acumulado. */}
      {progress > 0 && (
        <span
          className="inline-flex items-center gap-1"
          title={t("ui.billing.nextCreditProgress", { pct: String(pct) })}
        >
          <span className="h-1 w-8 overflow-hidden rounded-full bg-navy-200/25">
            <span className="block h-full rounded-full bg-navy-200" style={{ width: `${pct}%` }} />
          </span>
          <span className="tabular-nums text-navy-300">{pct}%</span>
        </span>
      )}
    </span>
  );

  // Solo org_admin puede comprar (el proxy exige billing:write; aquí gateamos el
  // trigger). El resto ve el saldo como texto sin acción.
  if (!isOrgAdmin) return content;

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="text-left transition-colors hover:text-white"
      >
        {content}
      </button>
      <CreditsPurchaseModal open={modalOpen} onOpenChange={setModalOpen} />
    </>
  );
}

export default function AppShell({
  children,
  appSlug,
  appName,
  appLogoUrl,
  sidebar,
  commandPalette,
  helpButton,
  creditBalance,
  breadcrumbs,
  overlays,
  providers,
  showAppSwitcherBar,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<UserInfo>({ displayName: "Cargando…", email: "", role: "" });
  const [org, setOrg] = useState<OrgInfo | undefined>(undefined);
  const [apps, setApps] = useState<AppInfo[]>([]);
  // Apps vendibles no concedidas (grayed en la toolbar, solo org_admin) + destino.
  const [sellableExtras, setSellableExtras] = useState<AppInfo[]>([]);
  const [subscribeUrl, setSubscribeUrl] = useState<string | null>(null);
  // Avisos de cortesía/trial expirado por app concedida (banner descartable).
  const [billingNotices, setBillingNotices] = useState<BillingNotice[]>([]);
  const [inactivityTimeout, setInactivityTimeout] = useState(15);
  // Label of the impersonated user when this is an impersonation session,
  // null otherwise. Drives the persistent "acting as" banner.
  const [impersonatedAs, setImpersonatedAs] = useState<string | null>(null);
  useAuthFetchGuard();

  useEffect(() => {
    // Carga del perfil con timeout + reintento. Antes era un `fetch().then()`
    // sin red de seguridad: si la petición se quedaba encallada en el navegador
    // (o devolvía algo sin `data`), el perfil se quedaba en "Cargando…" PARA
    // SIEMPRE, sin forma de recuperarse. Ahora abortamos a los 8 s y reintentamos
    // con backoff, de modo que un corte de red transitorio se auto-cura. Un 401
    // real lo intercepta `useAuthFetchGuard` (redirige a /login), así que aquí no
    // hace falta tratarlo aparte.
    let cancelled = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const r = await fetch("/api/auth/me", { signal: controller.signal });
        if (!r.ok) throw new Error(`me ${r.status}`);
        const json = await r.json();
        if (cancelled) return;
        if (!json?.data) throw new Error("me: respuesta sin data");
        const d = json.data;
        setUser({
          displayName: d.displayName || d.email,
          email: d.email,
          role: d.appRole || "",
        });
        if (d.org) setOrg({ name: d.org.name, logo: d.org.logo || null });
        if (d.apps) setApps(d.apps);
        if (Array.isArray(d.sellableExtras)) setSellableExtras(d.sellableExtras);
        setSubscribeUrl(d.subscribeUrl ?? null);
        if (Array.isArray(d.notices)) setBillingNotices(d.notices);
        if (d.inactivityTimeout) setInactivityTimeout(d.inactivityTimeout);
        setImpersonatedAs(
          d.impersonatedBy ? d.displayName || d.email || "" : null,
        );
      } catch {
        if (cancelled) return;
        // Backoff 2s → 4s → 8s → 15s (tope). Sigue reintentando para
        // auto-curarse cuando vuelva la conectividad, sin martillear el servidor.
        attempt += 1;
        const delay = Math.min(2000 * 2 ** (attempt - 1), 15000);
        retryTimer = setTimeout(load, delay);
      } finally {
        clearTimeout(timeout);
      }
    };

    load();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  const content = (
    <SidebarCollapseProvider>
    <PageHeaderProvider>
      {/* h-screen + overflow-hidden cierra la altura del shell entero. Sin
          esto, el scroll cae en <body> y la regla "página sin scroll, hijo
          con scroll" deja de funcionar (ver UI-ASSESMENT.md §1.3). */}
      <div className="flex h-screen overflow-hidden">
        {sidebar({
          user,
          apps,
          currentSlug: appSlug,
          mobileOpen,
          onMobileClose: () => setMobileOpen(false),
        })}
        <AppShellInner
          appName={appName}
          appLogoUrl={appLogoUrl}
          org={org}
          commandPalette={commandPalette}
          helpButton={helpButton}
          creditBalance={creditBalance}
          subscribeUrl={subscribeUrl}
          breadcrumbs={breadcrumbs}
          appSwitcherBar={
            showAppSwitcherBar ? (
              <AppSwitcherBar
                apps={apps}
                currentSlug={appSlug}
                unsubscribedApps={sellableExtras}
                subscribeUrl={subscribeUrl}
              />
            ) : undefined
          }
          impersonationBanner={
            impersonatedAs ? <ImpersonationBanner targetLabel={impersonatedAs} /> : undefined
          }
          billingNotices={
            // Solo el aviso de la app ACTUAL: los notices son de toda la org, pero
            // enseñar "Consultor caducó" dentro de Notaría sería ruido fuera de contexto.
            billingNotices.some((n) => n.appSlug === appSlug) ? (
              <BillingNoticeBanner
                notices={billingNotices.filter((n) => n.appSlug === appSlug)}
                subscribeUrl={subscribeUrl}
              />
            ) : undefined
          }
          onToggleMobile={() => setMobileOpen(!mobileOpen)}
        >
          {children}
        </AppShellInner>
      </div>
      {overlays}
      {/* Gate de re-aceptación de términos: se superpone si hay documentos
          legales vigentes sin aceptar. Fail-safe (no bloquea si no hay proxy). */}
      <LegalGate />
      <IdleTimeout
        timeoutMinutes={inactivityTimeout}
        onContinue={async () => {
          await fetch("/api/auth/refresh", { method: "POST" });
        }}
        onSilentRefresh={async () => {
          // Throwing on non-2xx lets IdleTimeout's interval guard skip
          // updating `lastRefreshAt`, so the next activity event retries
          // instead of waiting another full window with a stale token.
          const r = await fetch("/api/auth/refresh", { method: "POST" });
          if (!r.ok) throw new Error("refresh failed");
        }}
        onLogout={() => {
          // keepalive lets the POST finish even after navigation, so we can
          // redirect immediately instead of waiting for the fetch to settle —
          // otherwise a slow or hung logout call leaves the user sitting on
          // the page after clicking "Cerrar sesión".
          fetch("/api/auth/logout", { method: "POST", keepalive: true });
          window.location.href = "/login";
        }}
        onTimeout={() => {
          // Inactivity expiry — record SESSION_TIMEOUT in the audit trail
          // instead of LOGOUT. Best-effort, fire-and-forget with keepalive so
          // the request survives the immediate navigation below.
          fetch("/api/auth/session/timeout", { method: "POST", keepalive: true });
          window.location.href = "/login";
        }}
      />
    </PageHeaderProvider>
    </SidebarCollapseProvider>
  );

  return providers ? providers(content) : content;
}

export type { UserInfo, OrgInfo, AppShellProps };
