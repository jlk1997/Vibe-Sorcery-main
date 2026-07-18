import { useEffect, useLayoutEffect } from "react";
import { useDidShow } from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { bootstrapLocaleShell } from "../utils/localeStorage";

export function TabBarLocaleSync() {
  const { locale } = useLocale();

  useLayoutEffect(() => {
    bootstrapLocaleShell(locale);
  }, []);

  useEffect(() => {
    bootstrapLocaleShell(locale);
  }, [locale]);

  useDidShow(() => {
    bootstrapLocaleShell(locale);
  });

  return null;
}
