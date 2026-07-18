import Taro from "@tarojs/taro";
import { getLocaleCopy } from "../utils/localeCopy";
import { studioPage } from "../constants/routes";

/** Canonical share payload (title + registered page path) for a work. */
export function workSharePayload(workId: string, title: string): { title: string; path: string } {
  return { title, path: studioPage("provenance", { workId }) };
}

export function shareWork(workId: string, title: string) {
  const { title: t, path } = workSharePayload(workId, title);
  sharePage(t, path);
}

export function copyEmbedLink(workId: string) {
  const path = `/packageOps/pages/embed/index?workId=${encodeURIComponent(workId)}`;
  const s = getLocaleCopy().shareUi;
  if (process.env.TARO_ENV === "h5" && typeof window !== "undefined") {
    const url = `${window.location.origin}${path}`;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(url);
      Taro.showToast({ title: s.embedCopied, icon: "success" });
      return;
    }
  }
  Taro.showToast({ title: s.embedH5Only, icon: "none" });
}

export function sharePage(title: string, path: string) {
  const s = getLocaleCopy().shareUi;
  if (process.env.TARO_ENV === "weapp") {
    return { title, path };
  }
  if (typeof navigator !== "undefined" && navigator.share) {
    void navigator.share({ title, url: `${window.location.origin}${path}` });
    return;
  }
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    void navigator.clipboard.writeText(`${window.location.origin}${path}`);
    Taro.showToast({ title: s.linkCopied, icon: "success" });
    return;
  }
  Taro.showToast({ title: s.shareUnavailable, icon: "none" });
}
