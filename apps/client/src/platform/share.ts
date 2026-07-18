import Taro from "@tarojs/taro";
import { getLocaleCopy } from "../utils/localeCopy";

export function shareWork(workId: string, title: string) {
  const path = `/pages/provenance/index?workId=${encodeURIComponent(workId)}`;
  sharePage(title, path);
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
