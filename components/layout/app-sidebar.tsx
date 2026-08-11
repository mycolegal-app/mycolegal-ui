"use client";

import { useState, useEffect, type ReactNode, type ComponentType } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sliders,
  User,
} from "lucide-react";
import { NavLink as Link } from "../shared/nav-link";
import { NotificationsBell } from "../shared/notifications-bell";
import { UserAccountDialog } from "../shared/user-account-dialog";
import { MyAppsSection } from "./my-apps-section";
import { COMPANY_LOGO_DATA_URI } from "./company-logo";
import type { AppInfo } from "./app-info";
import { useIsOrgAdmin } from "../../hooks/use-is-org-admin";
import { useI18n } from "../i18n/i18n-context";
import { useSidebarCollapse } from "./sidebar-collapse-context";
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
  /** Logo de MycoLegalTech del banner de compañía que corona el sidebar (por
   *  encima de la marca de la app): en expandido, isotipo + wordmark
   *  «MycoLegalTech»; en plegado, solo el isotipo centrado.
   *
   *  Valor habitual: `"default"` — el isotipo lo sirve la propia `ui` desde un
   *  data URI, así que la app no necesita copiar ningún asset a su `public/`.
   *  Cualquier otro valor se trata como una ruta/URL de imagen a medida.
   *  Sin valor no se renderiza el banner. */
  companyLogoSrc?: "default" | (string & {});
  /** Per-app accent overrides. Default uses --mc-primary CSS variable. */
  accent?: AppSidebarAccent;
  /** Product nav items — only feature links. Admin/Settings/Manual handled by the shell. */
  navItems: AppSidebarNavItem[];
  /** Optional content rendered after navItems and before the system separator
   *  (e.g. a `<SidebarFlyout>` for Mantenimientos, or a labelled sub-section). */
  extraNav?: ReactNode;
  /** Optional node rendered in the user footer block, next to the notifications
   *  bell (both collapsed and expanded layouts). Use for an app-specific trigger
   *  such as the Foro/Comunidad icon with its unread badge. */
  userFooterExtra?: ReactNode;
  /** Optional content rendered in the system block (below the divider, next to
   *  Admin/Configuración and above Manual). Use for admin-level flyouts that
   *  should live in the system area rather than the product nav. */
  systemNav?: ReactNode;
  /** Show the Admin entry. Defaults to whatever `useIsOrgAdmin()` returns. */
  showAdmin?: boolean;
  /** Admin route (default: "/admin"). */
  adminHref?: string;
  /** If set, renders a Configuración entry pointing here. Hidden when undefined. */
  settingsHref?: string;
  /** Manual route (default: "/manual"). */
  manualHref?: string;
  /** Optional content rendered inside the Manual block, above the Manual link
   *  (sharing its divider/section). Use for admin-level flyouts that should sit
   *  in the same section as Manual rather than in the system block. */
  manualExtra?: ReactNode;
  /** Oculta el bloque "Mis aplicaciones" del sidebar. Las apps que usen el
   *  AppSwitcherBar (subheader) en su lugar deben activar este flag para
   *  evitar duplicar el acceso al catálogo de apps. */
  hideMyApps?: boolean;

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

/**
 * Fila de navegación del sidebar. En modo compacto se reduce a icono centrado
 * con el texto como `title` (tooltip nativo) y el badge se convierte en un
 * punto rojo superpuesto, en lugar de la píldora numérica.
 */
function SidebarLink({
  href,
  icon: Icon,
  label,
  active,
  badge,
  collapsed,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  badge?: number;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={cn(
        ITEM_BASE,
        collapsed && "justify-center px-0",
        active ? ITEM_ACTIVE : ITEM_INACTIVE,
      )}
    >
      <span className="relative flex shrink-0 items-center">
        <Icon className="h-4 w-4 shrink-0" />
        {collapsed && badge ? (
          <span className="absolute -right-1.5 -top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-[#0f1b2d]" />
        ) : null}
      </span>
      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {!collapsed && badge ? (
        <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

export function AppSidebar({
  appSlug,
  title,
  brandLogo,
  brandHref = "/",
  companyLogoSrc,
  accent,
  navItems,
  extraNav,
  userFooterExtra,
  systemNav,
  showAdmin,
  adminHref = "/admin",
  settingsHref,
  manualHref = "/manual",
  manualExtra,
  hideMyApps,
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
  const { collapsed, toggle } = useSidebarCollapse();

  const [accountOpen, setAccountOpen] = useState(false);
  // Local copy lets profile saves update the badge without forcing a layout
  // remount.
  const [displayName, setDisplayName] = useState(user.displayName);
  useEffect(() => setDisplayName(user.displayName), [user.displayName]);

  const a = { ...DEFAULT_ACCENT, ...(accent ?? {}) };
  const showAdminResolved = showAdmin ?? isOrgAdmin;
  const hasSystemBlock = showAdminResolved || Boolean(settingsHref) || Boolean(systemNav);
  // Padding lateral de los bloques: más estrecho en compacto para centrar
  // los iconos en la columna de 64px.
  const blockPadX = collapsed ? "px-2" : "px-3";

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

  // (avatar por icono de persona; ya no se calculan iniciales)

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
          "fixed left-0 top-0 z-50 flex h-screen flex-col overflow-visible bg-[#0f1b2d] transition-[width,transform] duration-200 lg:translate-x-0 lg:z-40",
          collapsed ? "w-[64px]" : "w-[220px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Banner de compañía MycoLegalTech (opcional). Se coloca por encima de
            la marca de la app y ocupa el ancho de la columna. Replica el logo de
            la columna izquierda del registro (isotipo + wordmark bicolor «Myco»
            en oro / «LegalTech» en blanco), escalado para caber en 220px. En
            plegado (64px) solo se muestra el isotipo centrado. */}
        {companyLogoSrc && (
          <button
            type="button"
            onClick={toggle}
            title={collapsed ? t("ui.sidebar.expand") : t("ui.sidebar.collapse")}
            aria-label={collapsed ? t("ui.sidebar.expand") : t("ui.sidebar.collapse")}
            className={cn(
              "flex w-full shrink-0 items-center border-b border-white/10 text-left transition-opacity hover:opacity-80",
              collapsed ? "justify-center px-2 py-3" : "gap-2 px-5 pb-3 pt-4",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={companyLogoSrc === "default" ? COMPANY_LOGO_DATA_URI : companyLogoSrc}
              alt="MycoLegalTech"
              className={cn("w-auto shrink-0", collapsed ? "h-8" : "h-7")}
            />
            {!collapsed && (
              <span className="truncate text-sm font-bold tracking-tight text-white">
                {/* «Myco» en el oro vivo de marca (isotipo dorado) — color fijo,
                    no depende del tema de la app: la marca de compañía es
                    constante en todas las apps. «LegalTech» en blanco. */}
                <span
                  style={{
                    backgroundImage: "linear-gradient(90deg,#f3d896,#d9a34e)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  Myco
                </span>
                LegalTech
              </span>
            )}
          </button>
        )}

        {/* Brand + toggle. En expandido: logo + título a la izquierda y el
            botón de plegar a la derecha. En compacto: logo centrado y el botón
            debajo, ambos centrados en la columna estrecha. */}
        {collapsed ? (
          <div className="flex flex-col items-center gap-2 px-2 py-4">
            <Link
              href={brandHref}
              aria-label={t("ui.sidebar.goHome")}
              title={title}
              className="transition-opacity hover:opacity-80"
            >
              {brandLogoNode()}
            </Link>
            <button
              type="button"
              onClick={toggle}
              title={t("ui.sidebar.expand")}
              aria-label={t("ui.sidebar.expand")}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-5 py-5">
            <Link
              href={brandHref}
              aria-label={t("ui.sidebar.goHome")}
              className="flex min-w-0 flex-1 items-center gap-3 transition-opacity hover:opacity-80"
            >
              {brandLogoNode()}
              <span
                className="min-w-0 flex-1 truncate text-base font-semibold leading-tight text-white"
                title={title}
              >
                {title}
              </span>
            </Link>
            <button
              type="button"
              onClick={toggle}
              title={t("ui.sidebar.collapse")}
              aria-label={t("ui.sidebar.collapse")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Main nav */}
        <nav
          className={cn(
            "mt-1 flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden",
            blockPadX,
          )}
        >
          {navItems.map((item) => (
            <SidebarLink
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              active={isActive(item.href)}
              badge={item.badge}
              collapsed={collapsed}
            />
          ))}

          {extraNav}
        </nav>

        {/* System block: Admin + Configuración (only rendered if at least one
            entry is visible). Sits below the product nav, separated by a
            divider. Configuración uses a distinct icon (Sliders) to set it
            apart visually from Admin (Settings/gear). */}
        {hasSystemBlock && (
          <div
            className={cn(
              "space-y-0.5 border-t border-white/10 pb-1 pt-3",
              blockPadX,
            )}
          >
            {showAdminResolved && (
              <SidebarLink
                href={adminHref}
                icon={Settings}
                label={t("ui.sidebar.admin")}
                active={isActive(adminHref)}
                collapsed={collapsed}
              />
            )}
            {settingsHref && (
              <SidebarLink
                href={settingsHref}
                icon={Sliders}
                label={t("ui.sidebar.settings")}
                active={isActive(settingsHref)}
                collapsed={collapsed}
              />
            )}
            {systemNav}
          </div>
        )}

        {/* Mis aplicaciones — siempre justo encima del Manual. Las apps que
            renderizan el AppSwitcherBar (subheader) lo ocultan con
            `hideMyApps` para no duplicar el acceso. */}
        {!hideMyApps && (
          <div
            className={cn(
              "space-y-0.5 border-t border-white/10 pb-1 pt-3",
              blockPadX,
            )}
          >
            <MyAppsSection apps={apps} currentSlug={currentSlug} />
          </div>
        )}

        {/* Manual — always above the user block, separated. `manualExtra`
            (e.g. an Administración flyout) shares this section/divider. */}
        <div
          className={cn(
            "space-y-0.5 border-t border-white/10 pb-3 pt-3",
            blockPadX,
          )}
        >
          {manualExtra}
          <SidebarLink
            href={manualHref}
            icon={BookOpen}
            label={t("ui.sidebar.manual")}
            active={isActive(manualHref)}
            collapsed={collapsed}
          />
        </div>

        {/* User info + logout */}
        {collapsed ? (
          <div className="flex flex-col items-center gap-2 border-t border-white/10 px-2 py-4">
            <button
              type="button"
              onClick={() => setAccountOpen(true)}
              title={`${displayName} · ${t("ui.sidebar.openAccount")}`}
              aria-label={t("ui.sidebar.openAccount")}
              className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-white/5 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
            >
              <User className="h-4 w-4" />
            </button>
            <NotificationsBell
              currentAppSlug={appSlug}
              onNavigateInternal={(link) => router.push(link)}
              verticalAlign="bottom"
              align="right"
            />
            {userFooterExtra}
            <button
              onClick={() => {
                fetch("/api/auth/logout", { method: "POST" }).then(() => {
                  window.location.href = "/login";
                });
              }}
              title={t("ui.sidebar.signOut")}
              aria-label={t("ui.sidebar.signOut")}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
            </button>
            <UserAccountDialog
              open={accountOpen}
              onOpenChange={setAccountOpen}
              appSlug={appSlug}
              onProfileUpdated={(p: { displayName: string }) =>
                setDisplayName(p.displayName)
              }
            />
          </div>
        ) : (
          <div className="space-y-3 border-t border-white/10 px-4 py-4">
            <button
              type="button"
              onClick={() => setAccountOpen(true)}
              title={t("ui.sidebar.openAccount")}
              aria-label={t("ui.sidebar.openAccount")}
              className="flex w-full min-w-0 items-center gap-3 rounded-lg p-1 text-left transition-colors hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center text-gray-400">
                <User className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-sm font-medium text-white"
                  title={displayName}
                >
                  {displayName}
                </p>
                <p
                  className="truncate text-[11px] text-gray-400"
                  title={user.email}
                >
                  {user.email}
                </p>
              </div>
            </button>
            {/* Campana + extras (Foro) centrados en una fila bajo el email. */}
            <div className="flex items-center justify-center gap-1">
              <NotificationsBell
                currentAppSlug={appSlug}
                onNavigateInternal={(link) => router.push(link)}
                verticalAlign="bottom"
                align="left"
              />
              {userFooterExtra}
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
        )}
      </aside>
    </>
  );
}
