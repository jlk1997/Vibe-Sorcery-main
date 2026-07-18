import Taro from "@tarojs/taro";
import { resolvePageUrl } from "../constants/routes";

function normalizeRoute(route: string) {
  return route.replace(/^\//, "").split("?")[0];
}

/** Patch Taro navigation so legacy /pages/journey|provenance|feedback URLs resolve to packageStudio. */
export function installRouteAliases() {
  (["navigateTo", "redirectTo", "reLaunch"] as const).forEach((method) => {
    const original = Taro[method].bind(Taro) as (opts: { url: string }) => Promise<unknown>;
    (Taro as unknown as Record<string, typeof original>)[method] = (opts: { url: string }) =>
      original({ ...opts, url: resolvePageUrl(opts.url) });
  });
}

/** Open a non-tab page; handles stack duplicates and navigateTo failures on H5. */
export function openStackPage(url: string) {
  const resolved = resolvePageUrl(url);
  const target = normalizeRoute(resolved);
  const pages = Taro.getCurrentPages();
  const top = pages[pages.length - 1];
  if (top && normalizeRoute(top.route || "") === target) return;

  const existingIdx = pages.findIndex((p) => normalizeRoute(p.route || "") === target);
  if (existingIdx >= 0) {
    const delta = pages.length - 1 - existingIdx;
    if (delta > 0) {
      void Taro.navigateBack({ delta });
      return;
    }
  }

  void Taro.navigateTo({ url: resolved }).catch(() => {
    void Taro.redirectTo({ url: resolved }).catch(() => {
      void Taro.reLaunch({ url: resolved });
    });
  });
}

export function navigateToPage(url: string) {
  openStackPage(url);
}
