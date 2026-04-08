"use client";

import { useEffect } from "react";
import { useHelp, type HelpAnnotation } from "./help-context";

/**
 * Hook to register help annotations for the current page.
 * Annotations are automatically cleared when the component unmounts.
 *
 * Usage:
 * ```tsx
 * usePageHelp([
 *   { target: '[data-help="search"]', text: 'Cerca per nom o NIF del client' },
 *   { target: '[data-help="new-btn"]', text: 'Crea un nou expedient', manualPath: '/manual/expedientes' },
 * ]);
 * ```
 */
export function usePageHelp(annotations: HelpAnnotation[]) {
  const { setAnnotations } = useHelp();

  useEffect(() => {
    setAnnotations(annotations);
    return () => setAnnotations([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setAnnotations]);
}
