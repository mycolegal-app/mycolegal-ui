"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePageHeader } from "./page-header-context";

interface PageTitleProps {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}

/**
 * Declarative component that sets the page header in the AppShell top bar.
 * Renders nothing visible — it just registers the title/subtitle/actions.
 */
export function PageTitle({ title, subtitle, children }: PageTitleProps) {
  const { setHeader, clearHeader } = usePageHeader();
  const childrenRef = useRef(children);
  childrenRef.current = children;

  useEffect(() => {
    setHeader({ title, subtitle, actions: childrenRef.current });
  }, [title, subtitle, setHeader]);

  useEffect(() => {
    setHeader({ title, subtitle, actions: children });
  });

  useEffect(() => {
    return () => clearHeader();
  }, [clearHeader]);

  return null;
}
