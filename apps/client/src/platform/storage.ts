import Taro from "@tarojs/taro";

const TOKEN_KEY = "token";

export function getItem(key: string): string | null {
  if (process.env.TARO_ENV === "h5" && typeof localStorage !== "undefined") {
    return localStorage.getItem(key);
  }
  try {
    return Taro.getStorageSync(key) || null;
  } catch {
    return null;
  }
}

export function setItem(key: string, value: string) {
  if (process.env.TARO_ENV === "h5" && typeof localStorage !== "undefined") {
    localStorage.setItem(key, value);
    return;
  }
  Taro.setStorageSync(key, value);
}

export function removeItem(key: string) {
  if (process.env.TARO_ENV === "h5" && typeof localStorage !== "undefined") {
    localStorage.removeItem(key);
    return;
  }
  Taro.removeStorageSync(key);
}

export function getToken(): string | null {
  return getItem(TOKEN_KEY);
}

export function saveToken(token: string) {
  setItem(TOKEN_KEY, token);
}

export function clearTokenStorage() {
  removeItem(TOKEN_KEY);
}
