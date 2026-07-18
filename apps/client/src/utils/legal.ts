export const LEGAL_STORAGE_KEYS = {
  privacyAccepted: "legal:privacy_accepted",
  privacyVersion: "legal:privacy_version",
} as const;

export const LEGAL_ROUTES = {
  privacy: "/packageLegal/pages/privacy/index",
  terms: "/packageLegal/pages/terms/index",
  aiNotice: "/packageLegal/pages/ai-notice/index",
  communityRules: "/packageLegal/pages/community-rules/index",
  paymentTerms: "/packageLegal/pages/payment-terms/index",
  minorProtection: "/packageLegal/pages/minor-protection/index",
} as const;

export const LEGAL_SLUGS = {
  privacy: "privacy-policy",
  terms: "terms-of-service",
  aiNotice: "ai-service-notice",
  communityRules: "community-guidelines",
  paymentTerms: "payment-terms",
  minorProtection: "minor-protection",
} as const;

export function openLegalPage(route: string) {
  const Taro = require("@tarojs/taro").default;
  Taro.navigateTo({ url: route }).catch(() => {
    Taro.showToast({ title: "无法打开页面", icon: "none" });
  });
}
