"use client";

import { useState, useEffect, type ReactNode, type ComponentType } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, LogOut, Settings, Sliders } from "lucide-react";
import { NavLink as Link } from "../shared/nav-link";
import { NotificationsBell } from "../shared/notifications-bell";
import { UserAccountDialog } from "../shared/user-account-dialog";
import { MyAppsSection } from "./my-apps-section";
import type { AppInfo } from "./app-info";
import { useIsOrgAdmin } from "../../hooks/use-is-org-admin";
import { useI18n } from "../i18n/i18n-context";
import { cn } from "../../lib/utils";

/**
 * Item rendered inside the scrollable nav block of the sidebar — provided by
 * each app for its own product features. System chrome (Admin, Settings,
 * Manual, User block) is rendered by `<AppSidebar>` itself, so apps must NOT
 * include those entries here.
 */
export interface AppSidebarNavItem {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  badge?: number;
}

type BrandLogo =
  | { type: "image"; src: string; alt: string }
  | { type: "icon"; node: ReactNode };

interface AppSidebarAccent {
  /** Background of the brand icon container (icon mode only). */
  iconBgClass?: string;
  /** Foreground of the brand icon (icon mode only). */
  iconTextClass?: string;
  /** Background of the user avatar circle. */
  avatarBgClass?: string;
  /** Foreground of the user avatar initials. */
  avatarTextClass?: string;
}

interface AppSidebarUser {
  displayName: string;
  email: string;
  role: string;
}

export interface AppSidebarProps {
  /** App slug — passed to NotificationsBell, MyAppsSection, UserAccountDialog. */
  appSlug: string;
  /** Brand title — rendered verbatim in white. Must match `title` in apps.json. */
  title: string;
  /** Brand logo — image or inline icon node. */
  brandLogo: BrandLogo;
  /** Brand link target (default: "/"). */
  brandHref?: string;
  /** Per-app accent overrides. Default uses --mc-primary CSS variable. */
  accent?: AppSidebarAccent;
  /** Product nav items — only feature links. Admin/Settings/Manual handled by the shell. */
  navItems: AppSidebarNavItem[];
  /** Optional content rendered after navItems and before the system separator
   *  (e.g. a `<SidebarFlyout>` for Mantenimientos, or a labelled sub-section). */
  extraNav?: ReactNode;
  /** Show the Admin entry. Defaults to whatever `useIsOrgAdmin()` returns. */
  showAdmin?: boolean;
  /** Admin route (default: "/admin"). */
  adminHref?: string;
  /** If set, renders a Configuración entry pointing here. Hidden when undefined. */
  settingsHref?: string;
  /** Manual route (default: "/manual"). */
  manualHref?: string;

  /* —— Props injected by <AppShell> —— */
  user: AppSidebarUser;
  apps: AppInfo[];
  currentSlug: string;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

const DEFAULT_ACCENT: Required<AppSidebarAccent> = {
  iconBgClass: "bg-mc-primary-500/20",
  iconTextClass: "text-mc-primary-400",
  avatarBgClass: "bg-mc-primary-500/20",
  avatarTextClass: "text-mc-primary-400",
};

const ITEM_BASE =
  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors";
const ITEM_ACTIVE = "bg-white/10 text-white";
const ITEM_INACTIVE = "text-gray-400 hover:bg-white/5 hover:text-white";

export function AppSidebar({
  appSlug,
  title,
  brandLogo,
  brandHref = "/",
  accent,
  navItems,
  extraNav,
  showAdmin,
  adminHref = "/admin",
  settingsHref,
  manualHref = "/manual",
  user,
  apps,
  currentSlug,
  mobileOpen,
  onMobileClose,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const isOrgAdmin = useIsOrgAdmin();

  const [accountOpen, setAccountOpen] = useState(false);
  // Local copy lets profile saves update the badge without forcing a layout
  // remount.
  const [displayName, setDisplayName] = useState(user.displayName);
  useEffect(() => setDisplayName(user.displayName), [user.displayName]);

  const a = { ...DEFAULT_ACCENT, ...(accent ?? {}) };
  const showAdminResolved = showAdmin ?? isOrgAdmin;
  const hasSystemBlock = showAdminResolved || Boolean(settingsHref);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  function brandLogoNode() {
    if (brandLogo.type === "image") {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={brandLogo.src} alt={brandLogo.alt} className="h-9 w-9" />;
    }
    return (
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg",
          a.iconBgClass,
          a.iconTextClass,
        )}
      >
        {brandLogo.node}
      </div>
    );
  }

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onMobileClose}
        />
      )}
      <aside
        className={cn(
          // overflow-visible on the aside so footer popovers (NotificationsBell)
          // are not clipped; vertical scroll lives on the inner <nav>.
          "fixed left-0 top-0 z-50 flex h-screen w-[220px] flex-col overflow-visible bg-[#0f1b2d] transition-transform lg:translate-x-0 lg:z-40",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Brand */}
        <Link
          href={brandHref}
          aria-label={t("ui.sidebar.goHome")}
          className="flex items-center gap-3 px-5 py-5 transition-opacity hover:opacity-80"
        >
          {brandLogoNode()}
          <span
            className="min-w-0 flex-1 truncate text-base font-semibold leading-tight text-white"
            title={title}
          >
            {title}
          </span>
        </Link>

        {/* Main nav */}
        <nav className="mt-1 flex-1 space-y-0.5 overflow-y-auto px-3">
          {navItems.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(ITEM_BASE, active ? ITEM_ACTIVE : ITEM_INACTIVE)}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
                {item.badge ? (
                  <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}

          {extraNav}
        </nav>

        {/* System block: Admin + Configuración (only rendered if at least one
            entry is visible). Sits below the product nav, separated by a
            divider. Configuración uses a distinct icon (Sliders) to set it
            apart visually from Admin (Settings/gear). */}
        {hasSystemBlock && (
          <div className="space-y-0.5 border-t border-white/10 px-3 pb-1 pt-3">
            {showAdminResolved && (
              <Link
                href={adminHref}
                className={cn(
                  ITEM_BASE,
                  isActive(adminHref) ? ITEM_ACTIVE : ITEM_INACTIVE,
                )}
              >
                <Settings className="h-4 w-4 shrink-0" />
                {t("ui.sidebar.admin")}
              </Link>
            )}
            {settingsHref && (
              <Link
                href={settingsHref}
                className={cn(
                  ITEM_BASE,
                  isActive(settingsHref) ? ITEM_ACTIVE : ITEM_INACTIVE,
                )}
              >
                <Sliders className="h-4 w-4 shrink-0" />
                {t("ui.sidebar.settings")}
              </Link>
            )}
          </div>
        )}

        {/* Mis aplicaciones — siempre justo encima del Manual. */}
        <div className="space-y-0.5 border-t border-white/10 px-3 pb-1 pt-3">
          <MyAppsSection apps={apps} currentSlug={currentSlug} />
        </div>

        {/* Manual — always above the user block, separated. */}
        <div className="space-y-0.5 border-t border-white/10 px-3 pb-3 pt-3">
          <Link
            href={manualHref}
            className={cn(
              ITEM_BASE,
              isActive(manualHref) ? ITEM_ACTIVE : ITEM_INACTIVE,
            )}
          >
            <BookOpen className="h-4 w-4 shrink-0" />
            {t("ui.sidebar.manual")}
          </Link>
        </div>

        {/* User info + logout */}
        <div className="space-y-3 border-t border-white/10 px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setAccountOpen(true)}
              title={t("ui.sidebar.openAccount")}
              aria-label={t("ui.sidebar.openAccount")}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-left transition-colors hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
            >
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  a.avatarBgClass,
                  a.avatarTextClass,
                )}
              >
                {displayName
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-sm font-medium text-white"
                  title={displayName}
                >
                  {displayName}
                </p>
                <p
                  className="truncate text-xs text-gray-400"
                  title={user.email}
                >
                  {user.email}
                </p>
              </div>
            </button>
            <NotificationsBell
              currentAppSlug={appSlug}
              onNavigateInternal={(link) => router.push(link)}
              verticalAlign="bottom"
              align="left"
            />
          </div>
          <UserAccountDialog
            open={accountOpen}
            onOpenChange={setAccountOpen}
            appSlug={appSlug}
            onProfileUpdated={(p: { displayName: string }) =>
              setDisplayName(p.displayName)
            }
          />

          <button
            onClick={() => {
              fetch("/api/auth/logout", { method: "POST" }).then(() => {
                window.location.href = "/login";
              });
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            {t("ui.sidebar.signOut")}
          </button>
        </div>
      </aside>
    </>
  );
}
