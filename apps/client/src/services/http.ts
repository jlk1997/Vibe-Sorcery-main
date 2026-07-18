import Taro from "@tarojs/taro";
import { setHttpAdapter, API_BASE } from "@vibe-sorcery/api-client";
import type { HttpResponse } from "@vibe-sorcery/api-client";
import { clearToken } from "../utils/auth";
import { STACK_PAGE_ROUTES } from "../constants/routes";
import { getLocaleCopy } from "../utils/localeCopy";

function arrayBufferToBlob(data: ArrayBuffer, contentType?: string) {
  if (typeof Blob === "undefined") {
    throw new Error("Blob is not available in this runtime");
  }
  return new Blob([data], { type: contentType || "application/octet-stream" });
}

function isFormDataBody(body: unknown): boolean {
  return typeof FormData !== "undefined" && body != null && body instanceof FormData;
}

function handleUnauthorized(status: number) {
  if (status !== 401) return;
  clearToken();
  Taro.showToast({ title: getLocaleCopy().httpUi.loginRequired, icon: "none" });
  const pages = Taro.getCurrentPages();
  const route = pages[pages.length - 1]?.route || "";
  if (!route.includes("login/index")) {
    setTimeout(() => {
      Taro.navigateTo({ url: STACK_PAGE_ROUTES.login }).catch(() => {});
    }, 400);
  }
}

export function installHttpAdapter() {
  if (process.env.TARO_ENV === "weapp") {
    console.info("[http] API_BASE =", API_BASE);
  }

  setHttpAdapter(async (url, options) => {
    const method = (options.method || "GET").toUpperCase();
    const header: Record<string, string> = { ...(options.headers || {}) };
    let data: string | undefined;

    if (isFormDataBody(options.body)) {
      if (process.env.TARO_ENV === "h5") {
        const res = await fetch(url, {
          method,
          headers: header,
          body: options.body as FormData,
        });
        handleUnauthorized(res.status);
        return { ok: res.ok, status: res.status, json: () => res.json(), blob: () => res.blob() };
      }
      throw new Error("FormData upload requires platform upload adapter on weapp");
    }

    if (typeof options.body === "string") data = options.body;

    try {
      const res = await Taro.request({
        url,
        method: method as keyof Taro.request.Method,
        header,
        data,
        responseType: method === "GET" && url.includes("/export") ? "arraybuffer" : "text",
      });
      const status = res.statusCode;
      handleUnauthorized(status);
      const contentType = (res.header?.["Content-Type"] || res.header?.["content-type"]) as
        | string
        | undefined;
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => (typeof res.data === "string" ? JSON.parse(res.data) : res.data),
        blob: async () => {
          if (res.data instanceof ArrayBuffer) return arrayBufferToBlob(res.data, contentType);
          if (typeof res.data === "string") {
            if (typeof Blob === "undefined") throw new Error("Blob is not available");
            return new Blob([res.data], { type: contentType });
          }
          if (typeof Blob === "undefined") throw new Error("Blob is not available");
          return new Blob([JSON.stringify(res.data)], { type: "application/json" });
        },
      } as HttpResponse;
    } catch (err) {
      console.error("[http] request failed:", method, url, err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  });
}

export { installHttpAdapter as installTaroHttpAdapter };
