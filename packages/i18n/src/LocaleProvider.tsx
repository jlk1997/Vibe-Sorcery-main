"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { type Copy, type Locale, defaultLocale, getCopy, loadEnCopy } from "./index";
import { zh } from "./locales/zh";

export const LOCALE_STORAGE_KEY = "vibe-locale";

export type LocaleStorage = {
  get: () => Locale | null;
  set: (locale: Locale) => void;
};

function readBrowserLocale(): Locale | null {
  try {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (stored === "zh" || stored === "en") return stored;
    }
  } catch {
    /* weapp / SSR */
  }
  return null;
}

function writeBrowserLocale(locale: Locale) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    }
  } catch {
    /* weapp */
  }
}

type LocaleContextValue = {
  locale: Locale;
  copy: Copy;
  setLocale: (locale: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  children,
  storage,
}: {
  children: React.ReactNode;
  storage?: LocaleStorage;
}) {
  const read = storage?.get ?? readBrowserLocale;
  const write = storage?.set ?? writeBrowserLocale;

  const [locale, setLocaleState] = useState<Locale>(() => read() ?? defaultLocale);
  const [copy, setCopy] = useState<Copy>(() => getCopy(read() ?? defaultLocale));

  useEffect(() => {
    if (locale === "en") {
      void loadEnCopy().then(setCopy);
    } else {
      setCopy(zh);
    }
  }, [locale]);

  const setLocale = useCallback(
    (next: Locale) => {
      setLocaleState(next);
      write(next);
      if (typeof document !== "undefined") {
        document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
      }
    },
    [write]
  );

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    }
  }, [locale]);

  const value = useMemo(() => ({ locale, copy, setLocale }), [locale, copy, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
