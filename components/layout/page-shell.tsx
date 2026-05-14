"use client";

import { type ReactNode } from "react";
import { PageTitle } from "./page-title";
import { HeaderActions } from "./header-actions";

interface PageShellProps {
  /** Title shown in the AppShell global header. */
  title: string;
  /** Subtitle shown below the title in the global header. */
  subtitle?: string;
  /** Buttons rendered in the global header's right slot (Print/Excel/CSV/Nuevo, etc.). */
  actions?: ReactNode;
  /**
   * Where the inner scroll lives. Defaults to `"main"` — the page wraps
   * `children` in a `flex-1 min-h-0 overflow-y-auto` container so long
   * content scrolls inside the page (not the viewport) and shrinks
   * reactively when the AppSwitcherBar expands.
   *
   * Use `"children"` when the page itself manages scroll internally
   * (e.g. lists using `<DataTable fillParent>` that already declare a
   * `flex-1 min-h-0` scroll area for the tbody). In that mode PageShell
   * just provides the outer `flex h-full min-h-0 flex-col` wrapper and
   * passes children through unchanged.
   */
  scroll?: "main" | "children";
  children: ReactNode;
}

/**
 * Standard page wrapper for the MycoLegal dashboard pattern. Use this
 * instead of hand-rolling `<div className="flex h-full min-h-0 flex-col">
 * <PageTitle>…</PageTitle> {…}</div>` on every page.
 *
 * What it does:
 * 1. Registers the title/subtitle in the global `PageTitle` slot so the
 *    AppShell header renders consistently across apps.
 * 2. Portals `actions` into the header's right slot via `<HeaderActions>`.
 * 3. Wraps `children` in a flex column that fills the available height of
 *    `<main>`, so the AppSwitcherBar expansion shrinks the content area
 *    (the inner section scrolls) instead of the whole window.
 *
 * Example (form / cards / dashboard):
 * ```tsx
 * <PageShell title="Configuración" subtitle="Ajustes de la cuenta"
 *            actions={<Button variant="header" size="sm">Imprimir</Button>}>
 *   <FormSection />
 *   <CardGrid />
 * </PageShell>
 * ```
 *
 * Example (list with `<DataTable fillParent>`):
 * ```tsx
 * <PageShell title="Expedientes" actions={…} scroll="children">
 *   <DataTable … scrollable fillParent />
 * </PageShell>
 * ```
 */
export function PageShell({
  title,
  subtitle,
  actions,
  scroll = "main",
  children,
}: PageShellProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageTitle title={title} subtitle={subtitle} />
      {actions && <HeaderActions>{actions}</HeaderActions>}
      {scroll === "main" ? (
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
      ) : (
        children
      )}
    </div>
  );
}
