import { getItem, removeItem, setItem } from "../platform/storage";

/** Bump when coach copy/steps change materially — clears per-page done flags only. */
export const ONBOARDING_VERSION = "2";

const GLOBAL_DISABLED_KEY = `onboarding:v${ONBOARDING_VERSION}:all`;
const pageKey = (page: string) => `onboarding:v${ONBOARDING_VERSION}:page:${page}`;
const LEGACY_PAGE_KEY = (page: string) => `onboarding_done_${page}`;
const JOURNEY_GUIDE_KEY = `onboarding:v${ONBOARDING_VERSION}:journey_guide_collapsed`;
const CONSENT_BANNER_KEY = "consent_banner_dismissed";

export type CoachPage = "create" | "journey" | "feed" | "library" | "profile";

/** Pages that auto-show multi-step coach on first visit (others: settings only). */
export const AUTO_COACH_PAGES: CoachPage[] = ["create", "journey", "feed", "library", "profile"];

function legacyPageDone(page: string): boolean {
  return getItem(LEGACY_PAGE_KEY(page)) === "1";
}

export function isOnboardingGloballyDisabled(): boolean {
  return getItem(GLOBAL_DISABLED_KEY) === "1";
}

export function disableAllOnboarding(): void {
  setItem(GLOBAL_DISABLED_KEY, "1");
}

export function enableAllOnboarding(): void {
  removeItem(GLOBAL_DISABLED_KEY);
  (["create", "journey", "feed", "library", "profile"] as CoachPage[]).forEach((p) => {
    removeItem(pageKey(p));
    removeItem(LEGACY_PAGE_KEY(p));
  });
  removeItem(JOURNEY_GUIDE_KEY);
  removeItem(CONSENT_BANNER_KEY);
}

export function isPageOnboardingDone(page: CoachPage): boolean {
  if (isOnboardingGloballyDisabled()) return true;
  if (getItem(pageKey(page)) === "1") return true;
  return legacyPageDone(page);
}

export function markPageOnboardingDone(page: CoachPage): void {
  setItem(pageKey(page), "1");
}

export function shouldShowPageCoach(page: CoachPage): boolean {
  if (isOnboardingGloballyDisabled()) return false;
  if (!AUTO_COACH_PAGES.includes(page)) return false;
  return !isPageOnboardingDone(page);
}

export function isJourneyGuideCollapsed(): boolean {
  return getItem(JOURNEY_GUIDE_KEY) === "1";
}

export function setJourneyGuideCollapsed(collapsed: boolean): void {
  setItem(JOURNEY_GUIDE_KEY, collapsed ? "1" : "0");
}

export function getConsentBannerDismissed(): Record<string, string> {
  try {
    const raw = getItem(CONSENT_BANNER_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function setConsentBannerDismissed(versions: Record<string, string>): void {
  setItem(CONSENT_BANNER_KEY, JSON.stringify(versions));
}
