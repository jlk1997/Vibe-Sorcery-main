import Taro from "@tarojs/taro";
import { isTabUrl, resolvePageUrl } from "../constants/routes";

const DEFAULT_TAB = "/pages/profile/index";

/** WeChat often ignores navigate/redirect if it runs in the same tick as showToast. */
const NAV_DELAY_MS = 400;
/** How long after an attempt we re-check whether we actually left the login page. */
const HEAL_CHECK_MS = 350;

function onLoginPage(): boolean {
  const pages = Taro.getCurrentPages?.() || [];
  const route = pages[pages.length - 1]?.route || "";
  return route.includes("login/index");
}

function goDefaultTab() {
  void Taro.switchTab({ url: DEFAULT_TAB }).catch(() => {});
}

/** Perform the actual navigation away from the login page. */
function performLeave(nextParam?: string) {
  const pages = Taro.getCurrentPages();
  const raw = nextParam?.trim();

  if (!raw) {
    if (pages.length > 1) {
      void Taro.navigateBack({ delta: 1 }).catch(goDefaultTab);
    } else {
      goDefaultTab();
    }
    return;
  }

  const target = resolvePageUrl(decodeURIComponent(raw));
  const path = target.split("?")[0];

  // Never bounce back to the login page (would look like it "stays" on login).
  if (path.includes("login/index")) {
    goDefaultTab();
    return;
  }

  if (isTabUrl(target)) {
    void Taro.switchTab({ url: path }).catch(goDefaultTab);
    return;
  }

  void Taro.redirectTo({ url: target }).catch(() => {
    if (pages.length > 1) void Taro.navigateBack({ delta: 1 }).catch(goDefaultTab);
    else goDefaultTab();
  });
}

/**
 * Dedupe truly-simultaneous callers (the success handler and the login page's
 * useDidShow can both fire), while still self-healing: WeChat sometimes drops a
 * navigation issued next to a toast / privacy popup, which used to leave the
 * user stranded on the login page. We re-check and retry until we leave.
 */
let navigating = false;

export function navigateAfterLogin(nextParam?: string) {
  if (navigating) return;
  navigating = true;

  setTimeout(() => {
    performLeave(nextParam);

    // Self-heal: if the first attempt was dropped and we're still on login, retry.
    setTimeout(() => {
      if (onLoginPage()) {
        performLeave(nextParam);
        setTimeout(() => {
          if (onLoginPage()) goDefaultTab();
          navigating = false;
        }, HEAL_CHECK_MS);
      } else {
        navigating = false;
      }
    }, HEAL_CHECK_MS);
  }, NAV_DELAY_MS);
}

export function showAuthSuccessAndLeave(toastTitle: string, nextParam?: string) {
  Taro.showToast({ title: toastTitle, icon: "success", duration: 1500 });
  navigateAfterLogin(nextParam);
}
