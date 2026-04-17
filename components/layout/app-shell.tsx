"use client";

import { useState, useEffect, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { PageHeaderProvider, usePageHeader } from "./page-header-context";
import { AppSwitcher, type AppInfo } from "./app-switcher";
import { IdleTimeout } from "./idle-timeout";
import { AppInfoButton } from "../shared/app-info-button";

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
  sidebar: (props: { user: UserInfo; mobileOpen: boolean; onMobileClose: () => void }) => ReactNode;
  /** Optional slots for the header right section */
  commandPalette?: ReactNode;
  helpButton?: ReactNode;
  /** Optional breadcrumbs below header */
  breadcrumbs?: ReactNode;
  /** Optional overlays (help overlay, keyboard shortcuts, etc.) */
  overlays?: ReactNode;
  /** Wrapper providers (I18n, Help, etc.) — receives children to wrap */
  providers?: (children: ReactNode) => ReactNode;
}

function AppShellInner({
  children,
  appSlug,
  appName,
  appLogoUrl,
  org,
  apps,
  commandPalette,
  helpButton,
  breadcrumbs,
  onToggleMobile,
}: {
  children: ReactNode;
  appSlug: string;
  appName: string;
  appLogoUrl?: string;
  org?: OrgInfo;
  apps: AppInfo[];
  commandPalette?: ReactNode;
  helpButton?: ReactNode;
  breadcrumbs?: ReactNode;
  onToggleMobile: () => void;
}) {
  const { header } = usePageHeader();

  return (
    <div className="lg:ml-[220px] flex flex-1 flex-col min-h-screen">
      {header && (
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-navy-600/30 bg-navy-700 px-6">
          {/* Mobile hamburger */}
          <button
            onClick={onToggleMobile}
            className="mr-3 lg:hidden text-white/70 hover:text-white"
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
            {header.actions && (
              <div className="flex items-center gap-2 print:hidden">
                {header.actions}
              </div>
            )}
            {commandPalette}
            {helpButton}
            <AppInfoButton appName={appName} appLogoUrl={appLogoUrl} />
            {/* App Switcher */}
            <AppSwitcher apps={apps} currentSlug={appSlug} />
            {/* Org info */}
            {org?.name && (
              <div className="flex items-center gap-2 pl-3 border-l border-white/15">
                {org.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={org.logo} alt={org.name} className="h-6 shrink-0 rounded object-contain" />
                ) : (
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-white/15 text-xs font-bold text-white">
                    {org.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-sm font-medium text-navy-100 hidden xl:block">{org.name}</span>
              </div>
            )}
          </div>
        </header>
      )}
      {breadcrumbs}
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-6">{children}</main>
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
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<UserInfo>({ displayName: "...", email: "", role: "" });
  const [org, setOrg] = useState<OrgInfo | undefined>(undefined);
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [inactivityTimeout, setInactivityTimeout] = useState(15);

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
        }
      })
      .catch(() => {});
  }, []);

  const content = (
    <PageHeaderProvider>
      <div className="flex min-h-screen">
        {sidebar({ user, mobileOpen, onMobileClose: () => setMobileOpen(false) })}
        <AppShellInner
          appSlug={appSlug}
          appName={appName}
          appLogoUrl={appLogoUrl}
          org={org}
          apps={apps}
          commandPalette={commandPalette}
          helpButton={helpButton}
          breadcrumbs={breadcrumbs}
          onToggleMobile={() => setMobileOpen(!mobileOpen)}
        >
          {children}
        </AppShellInner>
      </div>
      {overlays}
      <IdleTimeout
        timeoutMinutes={inactivityTimeout}
        onContinue={async () => {
          await fetch("/api/auth/refresh", { method: "POST" });
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
  );

  return providers ? providers(content) : content;
}

export type { UserInfo, OrgInfo, AppShellProps };
