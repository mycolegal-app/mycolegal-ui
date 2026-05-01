"use client";

import type { ComponentType } from "react";
import { useI18n } from "../i18n";

/**
 * Build a Next.js page component for a manual section. The returned component
 * reads the current language from the I18n context and asks the resolver for
 * the right content component. Every per-app section page collapses to:
 *
 * ```tsx
 * "use client";
 * import { makeManualSectionPage } from "@mycolegal-app/ui/components/help";
 * import { getManualComponent } from "@/content/manual";
 * export default makeManualSectionPage(getManualComponent, "expedientes");
 * ```
 */
export function makeManualSectionPage<S extends string>(
  resolve: (lang: string, section: S) => ComponentType,
  section: S
): ComponentType {
  function ManualSectionPage() {
    const { language } = useI18n();
    const Content = resolve(language, section);
    return <Content />;
  }
  ManualSectionPage.displayName = `ManualSectionPage(${section})`;
  return ManualSectionPage;
}
