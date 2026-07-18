import type { CSSProperties } from "react";
import Taro from "@tarojs/taro";
import { currentLayoutRoute, isImmersiveRoute, shouldShowTabBarLayout } from "../constants/routes";

/** Design tokens in rpx (750 design width). */
export const LAYOUT = {
  tabBar: 100,
  miniPlayer: 108,
  appHeader: 88,
} as const;

export type BottomLayoutVars = {
  tabBarHeight: string;
  tabBarStack: string;
  miniPlayerHeight: string;
  safeBottom: string;
};

const IMMERSIVE_PLAYER_CLASS = "immersive-player";

export function enterImmersivePlayerLayout() {
  if (typeof document === "undefined") return;
  document.documentElement.classList.add(IMMERSIVE_PLAYER_CLASS);
  setRootLayoutVar("--app-header-height", 0);
  applyBottomLayoutVars(getBottomLayoutVars({ miniPlayerVisible: false, forceTabBar: false }));
}

export function exitImmersivePlayerLayout() {
  if (typeof document === "undefined") return;
  document.documentElement.classList.remove(IMMERSIVE_PLAYER_CLASS);
  syncRootLayoutFromRoute();
}

/** Compute bottom inset CSS variables for H5 (document) or weapp (inline View style). */
export function getBottomLayoutVars(opts: {
  route?: string;
  miniPlayerVisible: boolean;
  forceTabBar?: boolean;
}): BottomLayoutVars {
  const route = opts.route ?? currentLayoutRoute();
  const immersive = isImmersiveRoute(route);
  const onTab = opts.forceTabBar ?? shouldShowTabBarLayout(route);
  const showPlayer = opts.miniPlayerVisible && !immersive;
  const playerLen = showPlayer ? layoutLength(LAYOUT.miniPlayer) : layoutLength(0);

  if (process.env.TARO_ENV === "weapp") {
    const onTab = opts.forceTabBar ?? shouldShowTabBarLayout(route);
    const tabStack = onTab ? layoutLength(LAYOUT.tabBar) : layoutLength(0);
    return {
      tabBarHeight: tabStack,
      tabBarStack: tabStack,
      miniPlayerHeight: playerLen,
      safeBottom: showPlayer ? playerLen : tabStack,
    };
  }

  const tabLen = onTab && !immersive ? layoutLength(LAYOUT.tabBar) : layoutLength(0);
  const tabStack =
    onTab && !immersive
      ? `calc(${layoutLength(LAYOUT.tabBar)} + env(safe-area-inset-bottom, 0px))`
      : layoutLength(0);

  let safeBottom = layoutLength(0);
  if (showPlayer && onTab) {
    safeBottom = `calc(${playerLen} + ${layoutLength(LAYOUT.tabBar)} + env(safe-area-inset-bottom, 0px))`;
  } else if (showPlayer) {
    safeBottom = playerLen;
  } else if (onTab) {
    safeBottom = tabStack;
  }

  return {
    tabBarHeight: tabStack,
    tabBarStack: tabStack,
    miniPlayerHeight: playerLen,
    safeBottom,
  };
}

export function layoutVarsToStyle(vars: BottomLayoutVars): CSSProperties {
  return {
    "--tab-bar-height": vars.tabBarHeight,
    "--tab-bar-stack": vars.tabBarStack,
    "--mini-player-height": vars.miniPlayerHeight,
    "--safe-bottom": vars.safeBottom,
  } as CSSProperties;
}

export function applyBottomLayoutVars(vars: BottomLayoutVars) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--tab-bar-height", vars.tabBarHeight);
  document.documentElement.style.setProperty("--tab-bar-stack", vars.tabBarStack);
  document.documentElement.style.setProperty("--mini-player-height", vars.miniPlayerHeight);
  document.documentElement.style.setProperty("--safe-bottom", vars.safeBottom);
}

/** Tab bar offset including iOS home-indicator safe area (H5). */
export function setTabBarLayoutVars(show: boolean) {
  const vars = getBottomLayoutVars({
    miniPlayerVisible: false,
    forceTabBar: show,
  });
  applyBottomLayoutVars({
    ...vars,
    miniPlayerHeight: document?.documentElement.style.getPropertyValue("--mini-player-height") || vars.miniPlayerHeight,
    safeBottom: document?.documentElement.style.getPropertyValue("--safe-bottom") || vars.safeBottom,
  });
}

export function setMiniPlayerLayoutVar(visible: boolean) {
  const route = currentLayoutRoute();
  const vars = getBottomLayoutVars({ route, miniPlayerVisible: visible });
  applyBottomLayoutVars(vars);
}

export function syncSafeBottom(opts: { miniPlayer: boolean; tabBar: boolean }) {
  const vars = getBottomLayoutVars({
    miniPlayerVisible: opts.miniPlayer,
    forceTabBar: opts.tabBar,
  });
  applyBottomLayoutVars(vars);
}

/** Reconcile header CSS vars with the active route (H5 document). Bottom insets come from LayoutVarsProvider. */
export function syncRootLayoutFromRoute(opts?: { showAppHeader?: boolean }) {
  if (typeof document === "undefined") return;
  const route = currentLayoutRoute();
  const onNowPlaying = isImmersiveRoute(route);
  if (!onNowPlaying) {
    document.documentElement.classList.remove(IMMERSIVE_PLAYER_CLASS);
  }
  const showHeader = opts?.showAppHeader ?? process.env.TARO_ENV === "h5";
  const immersive = onNowPlaying;
  setRootLayoutVar("--app-header-height", showHeader && !immersive ? LAYOUT.appHeader : 0);
}

/** rpx → px on H5, rpx on mini-program. Browsers cannot parse raw `rpx` in CSS variables. */
export function layoutLength(rpx: number): string {
  if (process.env.TARO_ENV === "h5") {
    return Taro.pxTransform(rpx);
  }
  return `${rpx}rpx`;
}

export function setRootLayoutVar(name: string, rpx: number) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty(name, layoutLength(rpx));
}

export function clearRootLayoutVar(name: string) {
  if (typeof document === "undefined") return;
  document.documentElement.style.removeProperty(name);
}
