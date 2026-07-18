import Taro, { useDidHide, useDidShow } from "@tarojs/taro";
import { isStudioTabBarRoute } from "../constants/routes";
import { syncRootLayoutFromRoute } from "../platform/layout";

/** Keep native tab bar visible on H5 for studio subpages (e.g. 情绪旅程). */
export function useStudioTabBarLayout(routeHint?: string) {
  useDidShow(() => {
    if (process.env.TARO_ENV !== "h5" || typeof document === "undefined") return;
    const route = routeHint || Taro.getCurrentPages().slice(-1)[0]?.route || "";
    if (!isStudioTabBarRoute(route)) return;
    document.documentElement.classList.add("layout-tab-visible");
    void Taro.showTabBar({ animation: false }).catch(() => {});
    syncRootLayoutFromRoute();
  });

  useDidHide(() => {
    if (process.env.TARO_ENV !== "h5" || typeof document === "undefined") return;
    document.documentElement.classList.remove("layout-tab-visible");
    syncRootLayoutFromRoute();
  });
}
