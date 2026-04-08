"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

export interface HelpAnnotation {
  /** CSS selector or data-help id to attach the tooltip to */
  target: string;
  /** Tooltip text */
  text: string;
  /** Optional link to manual section */
  manualPath?: string;
  /** Tooltip position relative to the target */
  position?: "top" | "bottom" | "left" | "right";
}

interface HelpContextValue {
  /** Whether help mode is active */
  active: boolean;
  /** Toggle help mode on/off */
  toggle: () => void;
  /** Current page's help annotations */
  annotations: HelpAnnotation[];
  /** Set annotations for the current page */
  setAnnotations: (annotations: HelpAnnotation[]) => void;
}

const HelpContext = createContext<HelpContextValue>({
  active: false,
  toggle: () => {},
  annotations: [],
  setAnnotations: () => {},
});

export function HelpProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [annotations, setAnnotationsState] = useState<HelpAnnotation[]>([]);

  const toggle = useCallback(() => setActive((prev) => !prev), []);

  const setAnnotations = useCallback((anns: HelpAnnotation[]) => {
    setAnnotationsState(anns);
  }, []);

  return (
    <HelpContext.Provider value={{ active, toggle, annotations, setAnnotations }}>
      {children}
    </HelpContext.Provider>
  );
}

export function useHelp() {
  return useContext(HelpContext);
}
