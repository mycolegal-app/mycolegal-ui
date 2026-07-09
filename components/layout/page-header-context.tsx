"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

interface PageHeaderState {
  title: string;
  subtitle?: string;
  /** Optional icon rendered to the LEFT of the title in the blue band. */
  icon?: ReactNode;
}

interface PageHeaderContextValue {
  header: PageHeaderState | null;
  setHeader: (state: PageHeaderState) => void;
  clearHeader: () => void;
  /**
   * DOM node where `<HeaderActions>` portals its children. Mounted by
   * `AppShell` via a ref callback. Null until the header has rendered.
   */
  actionsSlot: HTMLDivElement | null;
  /** Ref callback consumed by AppShell to register/unregister the slot. */
  registerActionsSlot: (el: HTMLDivElement | null) => void;
}

const PageHeaderContext = createContext<PageHeaderContextValue>({
  header: null,
  setHeader: () => {},
  clearHeader: () => {},
  actionsSlot: null,
  registerActionsSlot: () => {},
});

export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [header, setHeaderState] = useState<PageHeaderState | null>(null);
  // The slot lives in state (not just a ref) so consumers re-render when the
  // header mounts/unmounts and `<HeaderActions>` can decide whether to
  // portal yet. A useRef alone wouldn't trigger that re-render.
  const [actionsSlot, setActionsSlot] = useState<HTMLDivElement | null>(null);

  const setHeader = useCallback((state: PageHeaderState) => {
    setHeaderState(state);
  }, []);
  const clearHeader = useCallback(() => {
    setHeaderState(null);
  }, []);
  const registerActionsSlot = useCallback((el: HTMLDivElement | null) => {
    setActionsSlot(el);
  }, []);

  return (
    <PageHeaderContext.Provider
      value={{ header, setHeader, clearHeader, actionsSlot, registerActionsSlot }}
    >
      {children}
    </PageHeaderContext.Provider>
  );
}

export function usePageHeader() {
  return useContext(PageHeaderContext);
}
