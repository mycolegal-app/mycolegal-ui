"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Estado compartido del modo compacto/expandido del sidebar.
 *
 * Lo posee <AppShell> y lo consumen <AppSidebar> (para encogerse + pintar el
 * toggle), <AppShellInner> (para el margen del contenido), <MyAppsSection> y
 * <SidebarFlyout> (para anclar sus paneles al borde correcto). Vive en un
 * contexto para no tener que enhebrar la prop por el wrapper `sidebar.tsx` de
 * cada app.
 *
 * Persistencia: `localStorage` por origen → el estado es **por app** (cada
 * subdominio recuerda el suyo). Por defecto: expandido (no disruptivo).
 */

const STORAGE_KEY = "mc:sidebar:collapsed";

/** Ancho del aside en cada modo, en px. Compartido con los anclajes de flyout. */
export const SIDEBAR_WIDTH_EXPANDED = 220;
export const SIDEBAR_WIDTH_COLLAPSED = 64;

interface SidebarCollapseValue {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (next: boolean) => void;
  /** Ancho visible del sidebar en px según el modo actual. */
  width: number;
}

const SidebarCollapseContext = createContext<SidebarCollapseValue>({
  collapsed: false,
  toggle: () => {},
  setCollapsed: () => {},
  width: SIDEBAR_WIDTH_EXPANDED,
});

export function SidebarCollapseProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState(false);

  // Rehidratamos la preferencia tras montar (localStorage no existe en SSR).
  // El default expandido coincide con el primer paint, así que no hay flash
  // salvo para quien tenga guardado "compacto" (transición suave lo disimula).
  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "1") {
        setCollapsedState(true);
      }
    } catch {
      /* localStorage puede estar bloqueado (modo incógnito) */
    }
  }, []);

  const persist = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const setCollapsed = useCallback(
    (next: boolean) => {
      setCollapsedState(next);
      persist(next);
    },
    [persist],
  );

  const toggle = useCallback(() => {
    setCollapsedState((prev) => {
      persist(!prev);
      return !prev;
    });
  }, [persist]);

  const value = useMemo<SidebarCollapseValue>(
    () => ({
      collapsed,
      toggle,
      setCollapsed,
      width: collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED,
    }),
    [collapsed, toggle, setCollapsed],
  );

  return (
    <SidebarCollapseContext.Provider value={value}>
      {children}
    </SidebarCollapseContext.Provider>
  );
}

export function useSidebarCollapse(): SidebarCollapseValue {
  return useContext(SidebarCollapseContext);
}
