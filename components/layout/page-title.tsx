"use client";

import { useEffect, type ReactNode } from "react";
import { usePageHeader } from "./page-header-context";
import { HeaderActions } from "./header-actions";

interface PageTitleProps {
  title: string;
  subtitle?: string;
  /**
   * @deprecated Use `<HeaderActions>` instead. The `children` slot was a
   * source of race conditions when consumers re-rendered before the
   * provider's setHeader effect propagated, leaving the header without
   * actions. Backward-compat is kept (children render as if wrapped in
   * `<HeaderActions>`); migrate consumers when convenient.
   */
  children?: ReactNode;
}

/**
 * Declarative component that sets the page header title/subtitle in the
 * AppShell top bar. Renders nothing visible by itself.
 *
 * For top-bar action widgets (toggles, badges, buttons), use the
 * separate `<HeaderActions>` component — it portals its children into the
 * header without storing them in context.
 */
export function PageTitle({ title, subtitle, children }: PageTitleProps) {
  const { setHeader, clearHeader } = usePageHeader();

  useEffect(() => {
    setHeader({ title, subtitle });
    return () => clearHeader();
  }, [title, subtitle, setHeader, clearHeader]);

  // Backward-compat: forward `children` through `HeaderActions`. New code
  // should mount `<HeaderActions>` directly so the linter / typed-prop
  // deprecation can flag it.
  if (children !== undefined && children !== null) {
    return <HeaderActions>{children}</HeaderActions>;
  }
  return null;
}
