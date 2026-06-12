"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  isLocale,
  LOCALE_NAMES,
  LOCALES,
  translate,
  type Locale,
  type MessageKey,
} from "@/lib/i18n";

/**
 * Locale context: persists the chosen language in localStorage (and on the
 * user profile when signed in) and exposes a typed `t()` helper.
 */

const STORAGE_KEY = "carbonara_locale";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: "en",
  setLocale: () => {},
  t: (key, vars) => translate("en", key, vars),
});

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  // Restore the saved choice after hydration (SSR always renders English).
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) {
      setLocaleState(saved);
      document.documentElement.lang = saved;
    }
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next;
    // Best-effort: remember on the profile too (ignored when signed out).
    fetch("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: next }),
    }).catch(() => {});
  }, []);

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  );

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>{children}</LocaleContext.Provider>
  );
}

/** Typed translation hook: `const { t, locale, setLocale } = useT();` */
export function useT(): LocaleContextValue {
  return useContext(LocaleContext);
}

/** Language picker for the app bar (native-script names). */
export function LocaleToggle() {
  const { locale, setLocale, t } = useT();
  return (
    <span className="locale-picker">
      <label htmlFor="locale-select" className="visually-hidden">
        {t("app.language")}
      </label>
      <select
        id="locale-select"
        value={locale}
        onChange={(e) => {
          if (isLocale(e.target.value)) setLocale(e.target.value);
        }}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </span>
  );
}
