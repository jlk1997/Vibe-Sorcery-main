import { useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { Button } from "../ui";
import { ConsentCheckbox } from "./ConsentCheckbox";
import { LEGAL_ROUTES, LEGAL_STORAGE_KEYS } from "../../utils/legal";
import { getItem, setItem } from "../../platform/storage";
import "./PrivacyConsentGate.scss";

type Props = {
  onAccepted: () => void;
};

export function PrivacyConsentGate({ onAccepted }: Props) {
  const { copy } = useLocale();
  const l = copy.legalUi;
  const [checked, setChecked] = useState(false);

  function accept() {
    if (!checked) {
      Taro.showToast({ title: l.mustAgree, icon: "none" });
      return;
    }
    setItem(LEGAL_STORAGE_KEYS.privacyAccepted, "1");
    setItem(LEGAL_STORAGE_KEYS.privacyVersion, "2026-07-20");
    onAccepted();
  }

  return (
    <View className="privacy-gate">
      <View className="privacy-gate__card">
        <Text className="privacy-gate__title">{l.privacyGateTitle}</Text>
        <Text className="privacy-gate__body">{l.privacyGateBody}</Text>
        <ConsentCheckbox
          checked={checked}
          onChange={setChecked}
          links={[{ label: `《${l.privacyPolicy}》`, route: LEGAL_ROUTES.privacy }]}
        >
          {l.agreePrivacyOnly.replace(`《${l.privacyPolicy}》`, "")}
        </ConsentCheckbox>
        <View className="privacy-gate__actions">
          <Button variant="primary" block onClick={accept}>
            {l.privacyGateAgree}
          </Button>
        </View>
      </View>
    </View>
  );
}

export function hasLocalPrivacyConsent(): boolean {
  return getItem(LEGAL_STORAGE_KEYS.privacyAccepted) === "1";
}
