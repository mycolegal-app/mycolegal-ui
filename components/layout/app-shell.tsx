"use client";

import { useState, useEffect, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { PageHeaderProvider, usePageHeader } from "./page-header-context";
import { type AppInfo } from "./app-info";
import { IdleTimeout } from "./idle-timeout";
import { AppSwitcherBar } from "./app-switcher-bar";
import { AppInfoButton } from "../shared/app-info-button";
import { ImpersonationBanner } from "../shared/impersonation-banner";
import { LegalGate } from "../shared/legal-gate";
import {
  DefaultHelpButton,
  DefaultSearchButton,
} from "../shared/header-default-buttons";
import { useAuthFetchGuard } from "../../hooks/use-auth-fetch-guard";
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
  breadcrumbs,
  appSwitcherBar,
  impersonationBanner,
  onToggleMobile,
}: {
  children: ReactNode;
  appName: string;
  appLogoUrl?: string;
  org?: OrgInfo;
  commandPalette?: ReactNode;
  helpButton?: ReactNode;
  breadcrumbs?: ReactNode;
  appSwitcherBar?: ReactNode;
  impersonationBanner?: ReactNode;
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
        "flex flex-1 flex-col h-screen min-h-0 transition-[margin] duration-200",
        collapsed ? "lg:ml-[64px]" : "lg:ml-[220px]",
      )}
    >
      {impersonationBanner}
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
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold text-white truncate leading-tight">
              {header.title}
            </h1>
            {header.subtitle && (
              <p className="text-xs text-navy-200 truncate">{header.subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0 ml-4">
            {/* Slot where <HeaderActions> portals its children. `empty:hidden`
                keeps the wrapper out of the flex when no consumer is mounted
                — preserves the original "no extra gap" layout. */}
            <div
              ref={registerActionsSlot}
              className="flex items-center gap-2 print:hidden empty:hidden"
            />
            {commandPalette ?? <DefaultSearchButton />}
            {helpButton ?? <DefaultHelpButton />}
            <AppInfoButton appName={appName} appLogoUrl={appLogoUrl} />
            {/* Org info */}
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
      <span className="text-sm font-medium text-navy-100 hidden xl:block">{org.name}</span>
    </div>
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
  breadcrumbs,
  overlays,
  providers,
  showAppSwitcherBar,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<UserInfo>({ displayName: "Cargando…", email: "", role: "" });
  const [org, setOrg] = useState<OrgInfo | undefined>(undefined);
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [inactivityTimeout, setInactivityTimeout] = useState(15);
  // Label of the impersonated user when this is an impersonation session,
  // null otherwise. Drives the persistent "acting as" banner.
  const [impersonatedAs, setImpersonatedAs] = useState<string | null>(null);
  useAuthFetchGuard();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.data) {
          setUser({
            displayName: json.data.displayName || json.data.email,
            email: json.data.email,
            role: json.data.appRole || "",
          });
          if (json.data.org) {
            setOrg({ name: json.data.org.name, logo: json.data.org.logo || null });
          }
          if (json.data.apps) {
            setApps(json.data.apps);
          }
          if (json.data.inactivityTimeout) {
            setInactivityTimeout(json.data.inactivityTimeout);
          }
          setImpersonatedAs(
            json.data.impersonatedBy
              ? json.data.displayName || json.data.email || ""
              : null,
          );
        }
      })
      .catch(() => {});
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
          breadcrumbs={breadcrumbs}
          appSwitcherBar={
            showAppSwitcherBar ? (
              <AppSwitcherBar apps={apps} currentSlug={appSlug} />
            ) : undefined
          }
          impersonationBanner={
            impersonatedAs ? <ImpersonationBanner targetLabel={impersonatedAs} /> : undefined
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
