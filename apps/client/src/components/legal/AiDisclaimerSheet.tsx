import { useState } from "react";
import { View, Text, ScrollView } from "@tarojs/components";
import { useLocale } from "@vibe-sorcery/i18n";
import { BottomSheet, Button } from "../ui";
import { ConsentCheckbox } from "./ConsentCheckbox";
import { LEGAL_ROUTES } from "../../utils/legal";
import "./AiDisclaimerSheet.scss";

type Props = {
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function AiDisclaimerSheet({ open, loading, onClose, onConfirm }: Props) {
  const { copy } = useLocale();
  const l = copy.legalUi;
  const [checked, setChecked] = useState(false);

  return (
    <BottomSheet open={open} title={l.aiDisclaimerTitle} onClose={onClose}>
      <Text className="ai-disclaimer__body">{l.aiDisclaimerBody}</Text>
      <ConsentCheckbox
        checked={checked}
        onChange={setChecked}
        links={[{ label: `《${l.aiServiceNotice}》`, route: LEGAL_ROUTES.aiNotice }]}
      >
        {l.agreeAiNotice}
      </ConsentCheckbox>
      <View className="ai-disclaimer__footer">
        <Button variant="primary" block loading={loading} disabled={!checked} onClick={onConfirm}>
          {l.aiDisclaimerConfirm}
        </Button>
      </View>
    </BottomSheet>
  );
}
