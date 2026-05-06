"use client";

import { type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePageHeader } from "./page-header-context";

/**
 * Slot component that portals its children into the AppShell top-bar
 * actions area. Use this instead of passing actions as `children` to
 * `<PageTitle>` (deprecated — the children path stores actions in state
 * which had race conditions when the consumer re-rendered before the
 * provider's effect ran).
 *
 * Mount it anywhere inside the dashboard tree (typically right next to
 * `<PageTitle>`); the portal handles the DOM placement. Mount/unmount and
 * children updates flow naturally with React's reconciler — no context
 * state updates, no infinite-loop risk.
 *
 * Example:
 * ```tsx
 * <PageTitle title="Peticiones" subtitle="Portal de gestoría" />
 * <HeaderActions>
 *   <LangToggle />
 * </HeaderActions>
 * ```
 *
 * Renders nothing (returns null) until the header is on screen.
 */
export function HeaderActions({ children }: { children: ReactNode }) {
  const { actionsSlot } = usePageHeader();
  if (!actionsSlot) return null;
  return createPortal(children, actionsSlot);
}
