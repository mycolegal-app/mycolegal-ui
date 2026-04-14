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
  actions?: ReactNode;
}

interface PageHeaderContextValue {
  header: PageHeaderState | null;
  setHeader: (state: PageHeaderState) => void;
  clearHeader: () => void;
}

const PageHeaderContext = createContext<PageHeaderContextValue>({
  header: null,
  setHeader: () => {},
  clearHeader: () => {},
});

export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [header, setHeaderState] = useState<PageHeaderState | null>(null);

  const setHeader = useCallback((state: PageHeaderState) => {
    setHeaderState(state);
  }, []);

  const clearHeader = useCallback(() => {
    setHeaderState(null);
  }, []);

  return (
    <PageHeaderContext.Provider value={{ header, setHeader, clearHeader }}>
      {children}
    </PageHeaderContext.Provider>
  );
}

export function usePageHeader() {
  return useContext(PageHeaderContext);
}
