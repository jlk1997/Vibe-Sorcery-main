import Taro from "@tarojs/taro";
import { getCopy, LOCALE_STORAGE_KEY, type Copy, type Locale, defaultLocale } from "@vibe-sorcery/i18n";
import { getItem, setItem } from "../platform/storage";
import { TAB_PAGE_PATHS } from "../constants/routes";
import { syncTabBarLocale } from "./syncTabBar";
import { syncNavTitle } from "./syncNavTitle";

export { LOCALE_STORAGE_KEY };

export function getStoredLocale(): Locale {
  const stored = getItem(LOCALE_STORAGE_KEY);
  return stored === "en" ? "en" : stored === "zh" ? "zh" : defaultLocale;
}

const TAB_NAV_KEYS: Record<string, keyof Copy["navTitles"]> = {
  "pages/create/index": "create",
  "pages/feed/index": "feed",
  "pages/library/index": "library",
  "pages/profile/index": "profile",
};

export function navTitleForRoute(route: string, locale: Locale): string {
  const copy = getCopy(locale);
  const tabKey = TAB_PAGE_PATHS.find((p) => route.includes(p));
  if (tabKey && TAB_NAV_KEYS[tabKey]) {
    return copy.navTitles[TAB_NAV_KEYS[tabKey]];
  }
  return copy.meta.title;
}

function getCurrentRoute(): string {
  try {
    const pages = Taro.getCurrentPages?.();
    if (!pages?.length) return "";
    return pages[pages.length - 1]?.route || "";
  } catch {
    return "";
  }
}

export function bootstrapLocaleShell(locale = getStoredLocale()) {
  try {
    syncTabBarLocale(locale);
  } catch {
    /* router / tab bar not ready */
  }
  try {
    const route = getCurrentRoute();
    syncNavTitle(navTitleForRoute(route, locale));
  } catch {
    syncNavTitle(getCopy(locale).meta.title);
  }
}

export function createLocaleStorage(): { get: () => Locale | null; set: (locale: Locale) => void } {
  return {
    get: () => {
      const stored = getItem(LOCALE_STORAGE_KEY);
      return stored === "zh" || stored === "en" ? stored : null;
    },
    set: (locale: Locale) => setItem(LOCALE_STORAGE_KEY, locale),
  };
}
