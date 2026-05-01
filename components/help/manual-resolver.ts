import type { ComponentType } from "react";

/**
 * Build a resolver that picks the right manual content component for a given
 * language and section. Each app passes its own `next/dynamic` imports keyed
 * by language code (CAST | CAT | GAL | EUS) and section name. VAL is treated
 * as CAT, and any unknown language falls back to CAST.
 */
export function createManualResolver<S extends string>(
  components: Partial<Record<string, Record<S, ComponentType>>>,
  defaultLang: string = "CAST"
) {
  return function getManualComponent(language: string, section: S): ComponentType {
    const lang = language === "VAL" ? "CAT" : language;
    return components[lang]?.[section] || components[defaultLang]![section];
  };
}
