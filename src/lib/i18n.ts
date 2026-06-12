import en from "./messages/en.json";
import hi from "./messages/hi.json";
import bn from "./messages/bn.json";
import gu from "./messages/gu.json";
import ta from "./messages/ta.json";

/**
 * Lightweight typed i18n with zero runtime dependencies.
 *
 * `messages/en.json` is the source of truth. Hindi is hand-curated; Bengali,
 * Gujarati and Tamil are machine-generated at build time by
 * `scripts/translate.mjs` (Google Cloud Translation) and committed, so the
 * app needs no API key and no network at runtime. `translate()` falls back
 * to English for any missing value. Interpolation uses `{name}` placeholders.
 *
 * Deliberately not translated (documented tradeoff): chatbot free-text
 * history, CSV export headers, API error strings, and the smart-tip engine.
 */

export const LOCALES = ["en", "hi", "bn", "gu", "ta"] as const;
export type Locale = (typeof LOCALES)[number];

/** Native-script names for the language picker. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  hi: "हिंदी",
  bn: "বাংলা",
  gu: "ગુજરાતી",
  ta: "தமிழ்",
};

export type MessageKey = keyof typeof en;

const DICTS: Record<Locale, Partial<Record<MessageKey, string>>> = { en, hi, bn, gu, ta };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Translate a message key, interpolating `{var}` placeholders.
 * Missing/empty values fall back to English.
 */
export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  let text = DICTS[locale][key] || en[key];
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

/**
 * Localized label for an emission factor (`factor.<key>` message), falling
 * back to the factor's built-in English label for unknown keys.
 */
export function factorLabel(locale: Locale, factor: { key: string; label: string }): string {
  const messageKey = `factor.${factor.key}`;
  if (messageKey in en) {
    return translate(locale, messageKey as MessageKey);
  }
  return factor.label;
}
