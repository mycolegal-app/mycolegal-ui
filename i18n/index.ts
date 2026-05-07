// UI package translation defaults.
//
// Each consumer app passes these to <I18nProvider defaults={...}> so that any
// string the shared `mycolegal-ui` components render falls back to the package's
// own translation when the app hasn't defined the key. The app's `messages`
// always wins, so a consumer can override any UI string by adding the same key
// to its own locale file.
//
// Resolution order inside `t(key)`:
//   1. app `messages[lang]` (set by I18nProvider#messages)
//   2. UI defaults (this object, via I18nProvider#defaults)
//   3. dev warning + readable-key fallback
//
// VAL is normalized to CAT inside the provider.

import cast from "./cast.json";
import cat from "./cat.json";
import eus from "./eus.json";
import gal from "./gal.json";
import type { Language, TranslationMessages } from "../components/i18n/i18n-context";

export const uiMessages: Record<"CAST" | "CAT" | "EUS" | "GAL", TranslationMessages> = {
  CAST: cast as TranslationMessages,
  CAT: cat as TranslationMessages,
  EUS: eus as TranslationMessages,
  GAL: gal as TranslationMessages,
};

export function getUiDefaults(language: Language): TranslationMessages {
  if (language === "VAL") return uiMessages.CAT;
  return uiMessages[language] ?? uiMessages.CAST;
}
