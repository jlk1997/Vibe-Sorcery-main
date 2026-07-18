import Taro from "@tarojs/taro";
import { getCopy, type Locale } from "@vibe-sorcery/i18n";

export function syncTabBarLocale(locale: Locale) {
  const t = getCopy(locale).tabBar;
  const items = [
    { index: 0, text: t.create },
    { index: 1, text: t.feed },
    { index: 2, text: t.library },
    { index: 3, text: t.profile },
  ];
  items.forEach(({ index, text }) => {
    Taro.setTabBarItem({ index, text }).catch(() => {});
  });
}
