import { setAuthToken } from "@vibe-sorcery/api-client";
import Taro from "@tarojs/taro";
import { getToken, saveToken as saveStorageToken, clearTokenStorage } from "../platform/storage";
import { STACK_PAGE_ROUTES, stackPage } from "../constants/routes";

export function bootstrapAuth() {
  const token = getToken();
  setAuthToken(token);
}

export function saveAuthToken(token: string) {
  saveStorageToken(token);
  setAuthToken(token);
}

export function saveToken(token: string) {
  saveAuthToken(token);
}

export function clearToken() {
  clearTokenStorage();
  setAuthToken(null);
}

export function isLoggedIn(): boolean {
  bootstrapAuth();
  return !!getToken();
}

function loginReturnPath(): string | undefined {
  try {
    const pages = Taro.getCurrentPages();
    const top = pages[pages.length - 1];
    if (!top?.route) return undefined;
    const base = top.route.startsWith("/") ? top.route : `/${top.route}`;
    if (base.includes("/login/index")) return undefined;
    const opts = (top as { options?: Record<string, string> }).options;
    if (!opts || Object.keys(opts).length === 0) return base;
    const qs = Object.entries(opts)
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join("&");
    return qs ? `${base}?${qs}` : base;
  } catch {
    return undefined;
  }
}

export function requireAuth(next?: string): boolean {
  bootstrapAuth();
  if (!getToken()) {
    const returnPath = next ?? loginReturnPath();
    const url = returnPath ? stackPage("login", { next: returnPath }) : STACK_PAGE_ROUTES.login;
    Taro.navigateTo({ url });
    return false;
  }
  return true;
}
