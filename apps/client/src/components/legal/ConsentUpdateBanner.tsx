import { useEffect, useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { Button } from "../ui";
import { vibeApi } from "../../services/api";
import { isLoggedIn } from "../../utils/auth";
import { getRequiredVersions } from "../../utils/consent";
import { getConsentBannerDismissed, setConsentBannerDismissed } from "../../utils/onboarding";
import { LEGAL_ROUTES } from "../../utils/legal";
import "./ConsentUpdateBanner.scss";

export function ConsentUpdateBanner() {
  const { copy } = useLocale();
  const l = copy.legalUi;
  const [missing, setMissing] = useState<string[]>([]);
  const [requiredVersions, setRequiredVersions] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) return;
    Promise.all([vibeApi.getConsentStatus(), getRequiredVersions()])
      .then(([s, versions]) => {
        const outdated = (s.missing || []).filter((m) => m === "terms" || m === "privacy");
        const dismissed = getConsentBannerDismissed();
        const stillNeeded = outdated.filter((type) => {
          const ver = versions[type as keyof typeof versions] || s.required_versions?.[type];
          return !ver || dismissed[type] !== ver;
        });
        setRequiredVersions({ ...s.required_versions, ...versions });
        setMissing(stillNeeded);
      })
      .catch(() => {});
  }, []);

  if (!missing.length) return null;

  async function acceptUpdates() {
    setLoading(true);
    try {
      const versions = requiredVersions.terms ? requiredVersions : await getRequiredVersions();
      const consents = missing.map((type) => ({
        consent_type: type,
        version: versions[type as keyof typeof versions] || "2026-07-20",
      }));
      await vibeApi.recordConsents(consents);
      setMissing([]);
      Taro.showToast({ title: l.consentUpdateSuccess, icon: "success" });
    } catch {
      Taro.showToast({ title: l.consentUpdateFail, icon: "none" });
    } finally {
      setLoading(false);
    }
  }

  function dismissForNow() {
    const snapshot: Record<string, string> = {};
    for (const type of missing) {
      const ver = requiredVersions[type];
      if (ver) snapshot[type] = ver;
    }
    setConsentBannerDismissed({ ...getConsentBannerDismissed(), ...snapshot });
    setMissing([]);
  }

  return (
    <View className="consent-update-banner">
      <Text className="consent-update-banner__text">{l.consentUpdateBody}</Text>
      <View className="consent-update-banner__actions">
        <Button size="sm" variant="primary" loading={loading} onClick={acceptUpdates}>
          {l.consentUpdateAgree}
        </Button>
        <Button size="sm" variant="ghost" onClick={dismissForNow}>
          {l.consentDismiss}
        </Button>
        <Text className="consent-update-banner__link" onClick={() => Taro.navigateTo({ url: LEGAL_ROUTES.terms })}>
          {l.viewDocument}
        </Text>
      </View>
    </View>
  );
}
