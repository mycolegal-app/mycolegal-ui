"use client";

import {
  createContext,
  useContext,
  useCallback,
  type ReactNode,
} from "react";

export type Language = "CAST" | "CAT" | "VAL" | "GAL" | "EUS";

export type TranslationMessages = Record<string, string | Record<string, string>>;

interface I18nContextValue {
  /** Current language code */
  language: Language;
  /** Get a translated string by dot-separated key. Supports interpolation with {key} */
  t: (key: string, params?: Record<string, string | number>) => string;
  /** All loaded messages */
  messages: TranslationMessages;
}

const I18nContext = createContext<I18nContextValue>({
  language: "CAST",
  t: (key) => key,
  messages: {},
});

/**
 * Resolve a dot-separated key from nested messages.
 * e.g. "dashboard.kpi.title" → messages.dashboard.kpi.title
 */
function resolveKey(messages: TranslationMessages, key: string): string | undefined {
  const parts = key.split(".");
  let current: any = messages;

  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }

  return typeof current === "string" ? current : undefined;
}

/**
 * Interpolate {param} placeholders in a translated string.
 */
function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (_, key) =>
    params[key] !== undefined ? String(params[key]) : `{${key}}`
  );
}

interface I18nProviderProps {
  language: Language;
  messages: TranslationMessages;
  children: ReactNode;
}

export function I18nProvider({ language, messages, children }: I18nProviderProps) {
  // Normalize VAL to CAT (same translations)
  const effectiveLang = language === "VAL" ? "CAT" : language;

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      const value = resolveKey(messages, key);
      if (value === undefined) {
        // Fallback: return the last segment of the key as readable text
        if (process.env.NODE_ENV === "development") {
          console.warn(`[i18n] Missing translation: "${key}" (${effectiveLang})`);
        }
        return interpolate(key.split(".").pop() || key, params);
      }
      return interpolate(value, params);
    },
    [messages, effectiveLang]
  );

  return (
    <I18nContext.Provider value={{ language: effectiveLang as Language, t, messages }}>
      {children}
    </I18nContext.Provider>
  );
}

/**
 * Hook to access translations in client components.
 *
 * Usage:
 * ```tsx
 * const { t } = useI18n();
 * return <h1>{t("dashboard.title")}</h1>;
 * ```
 */
export function useI18n() {
  return useContext(I18nContext);
}

/**
 * Language labels for display (no flags, just codes).
 */
export const LANGUAGE_OPTIONS: { code: Language; label: string }[] = [
  { code: "CAST", label: "CAST" },
  { code: "CAT", label: "CAT" },
  { code: "VAL", label: "VAL" },
  { code: "GAL", label: "GAL" },
  { code: "EUS", label: "EUS" },
];
