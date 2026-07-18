import Taro from "@tarojs/taro";
import { isTabUrl, resolvePageUrl } from "../constants/routes";

const DEFAULT_TAB = "/pages/profile/index";

/** WeChat often ignores navigate/redirect if it runs in the same tick as showToast. */
const NAV_DELAY_MS = 400;

function leaveLoginPage(pages: Taro.Page[]) {
  if (pages.length > 1) {
    void Taro.navigateBack({ delta: 1 });
    return;
  }
  void Taro.switchTab({ url: DEFAULT_TAB });
}

export function navigateAfterLogin(nextParam?: string) {
  setTimeout(() => {
    const pages = Taro.getCurrentPages();
    const raw = nextParam?.trim();
    if (!raw) {
      leaveLoginPage(pages);
      return;
    }

    const target = resolvePageUrl(decodeURIComponent(raw));
    const path = target.split("?")[0];

    if (isTabUrl(target)) {
      void Taro.switchTab({ url: path });
      return;
    }

    void Taro.redirectTo({ url: target }).catch(() => leaveLoginPage(pages));
  }, NAV_DELAY_MS);
}

export function showAuthSuccessAndLeave(toastTitle: string, nextParam?: string) {
  Taro.showToast({ title: toastTitle, icon: "success", duration: 1500 });
  navigateAfterLogin(nextParam);
}
