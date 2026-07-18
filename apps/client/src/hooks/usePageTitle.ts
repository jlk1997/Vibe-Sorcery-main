import { useEffect } from "react";
import { useDidShow } from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { syncNavTitle } from "../utils/syncNavTitle";

export function usePageTitle(title: string) {
  const { locale } = useLocale();

  useDidShow(() => syncNavTitle(title));

  useEffect(() => {
    syncNavTitle(title);
  }, [title, locale]);
}
