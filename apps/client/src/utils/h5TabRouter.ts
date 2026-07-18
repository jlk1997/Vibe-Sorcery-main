import Taro from "@tarojs/taro";
import { isTabRoute } from "../constants/routes";

let reconcileLock = false;

/** Strip leading slash and query/hash — Taro H5 page ids include `?$taroTimestamp=…`. */
function normalizePagePath(path: string): string {
  return path.replace(/^\//, "").split("?")[0].split("#")[0];
}

function currentHashRoute(): string {
  if (typeof window === "undefined") return "";
  return normalizePagePath(window.location.hash.replace(/^#\/?/, ""));
}

function hashTabRoute(): string | null {
  const hash = currentHashRoute();
  if (!hash || !isTabRoute(hash)) return null;
  return hash;
}

/** navigateTo 子页面 — hash 已切到非 Tab 路由 */
function isStackRoute(): boolean {
  const hash = currentHashRoute();
  return !!hash && !isTabRoute(hash);
}

/**
 * Tab 高亮仅以 hash 为准；仅在 hash 尚未更新时用栈顶 Tab 兜底。
 * 切勿在子页面路由时用栈顶 Tab 兜底 — 会把 Tab 页重新显示并盖住子页面（黑屏）。
 */
function activeTabRoute(): string | null {
  const hash = currentHashRoute();
  if (hash) {
    return isTabRoute(hash) ? hash : null;
  }
  const stack = normalizePagePath(Taro.getCurrentPages().slice(-1)[0]?.route || "");
  if (stack && isTabRoute(stack)) return stack;
  return null;
}

function pathsMatch(a: string, b: string): boolean {
  return normalizePagePath(a) === normalizePagePath(b);
}

function pageElMatchesRoute(el: HTMLElement, route: string): boolean {
  const id = normalizePagePath(el.id || "");
  const normalized = normalizePagePath(route);
  if (!id || !normalized) return false;
  if (pathsMatch(id, normalized)) return true;
  if (id.replace(/_/g, "/") === normalized) return true;
  return id.replace(/[^a-z0-9/_-]/gi, "_") === normalized.replace(/\//g, "_");
}

function currentStackRoute(): string {
  const fromHash = currentHashRoute();
  if (fromHash && !isTabRoute(fromHash)) return fromHash;
  const stack = normalizePagePath(Taro.getCurrentPages().slice(-1)[0]?.route || "");
  if (stack && !isTabRoute(stack)) return stack;
  return fromHash || stack;
}

/** Keep navigateTo / redirectTo stack pages above tab pages on H5. */
export function syncStackPageVisibility() {
  if (process.env.TARO_ENV !== "h5" || typeof document === "undefined") return;
  if (!isStackRoute()) return;

  const activeRoute = currentStackRoute();
  if (!activeRoute) return;

  const stackPages = document.querySelectorAll<HTMLElement>(".taro_page:not(.taro_tabbar_page)");
  if (!stackPages.length) return;

  let activeEl: HTMLElement | null = null;
  stackPages.forEach((el) => {
    if (pageElMatchesRoute(el, activeRoute)) activeEl = el;
  });
  if (!activeEl) activeEl = stackPages[stackPages.length - 1];

  document.querySelectorAll<HTMLElement>(".taro_page.taro_tabbar_page").forEach((el) => {
    el.classList.add("taro_page_shade");
    el.classList.remove("taro_page_show");
    el.style.removeProperty("z-index");
  });

  stackPages.forEach((el) => {
    const isActive = el === activeEl;
    if (isActive) {
      el.classList.remove("taro_page_shade");
      el.classList.add("taro_page_show", "taro_page_stationed");
      el.style.removeProperty("display");
      el.style.removeProperty("visibility");
      el.style.removeProperty("transform");
      el.style.zIndex = "10";
    } else if (el.classList.contains("taro_page_show")) {
      el.classList.add("taro_page_shade");
      el.classList.remove("taro_page_show");
      el.style.removeProperty("z-index");
    }
  });
}

/** Force correct tab page visibility when Taro router / tab bar get out of sync (H5). */
export function syncTabPageVisibility() {
  if (process.env.TARO_ENV !== "h5" || typeof document === "undefined") return;
  if (isStackRoute()) return;

  const activeRoute = activeTabRoute();
  if (!activeRoute) return;

  const tabPages = document.querySelectorAll<HTMLElement>(".taro_page.taro_tabbar_page");
  if (!tabPages.length) return;

  let activeEl: HTMLElement | null = null;
  tabPages.forEach((el) => {
    if (pageElMatchesRoute(el, activeRoute)) activeEl = el;
  });

  if (!activeEl) {
    reconcileTabStack();
    return;
  }

  tabPages.forEach((el) => {
    const isActive = el === activeEl;
    if (isActive) {
      el.classList.remove("taro_page_shade");
      el.classList.add("taro_page_show", "taro_page_stationed");
      el.style.removeProperty("display");
      el.style.removeProperty("visibility");
      el.style.zIndex = "1";
    } else {
      el.classList.add("taro_page_shade");
      el.classList.remove("taro_page_show");
      el.style.removeProperty("display");
      el.style.removeProperty("visibility");
      el.style.removeProperty("z-index");
    }
  });
}

export function syncH5PageVisibility() {
  if (isStackRoute()) syncStackPageVisibility();
  else syncTabPageVisibility();
}

function reconcileTabStack() {
  if (process.env.TARO_ENV !== "h5" || reconcileLock) return;

  const target = activeTabRoute();
  if (!target) return;

  const stackRoute = normalizePagePath(Taro.getCurrentPages().slice(-1)[0]?.route || "");
  if (pathsMatch(stackRoute, target)) return;

  reconcileLock = true;
  void Taro.switchTab({ url: `/${target}` })
    .then(() => syncTabPageVisibility())
    .catch(() => Taro.reLaunch({ url: `/${target}` }))
    .finally(() => {
      reconcileLock = false;
    });
}

export function installH5TabRouterFix() {
  if (process.env.TARO_ENV !== "h5" || typeof window === "undefined") return;

  const run = () => syncH5PageVisibility();

  window.addEventListener("hashchange", run);
  Taro.eventCenter.on("__taroRouterChange", run);
  Taro.eventCenter.on("__afterTaroRouterChange", run);
  requestAnimationFrame(run);
}
