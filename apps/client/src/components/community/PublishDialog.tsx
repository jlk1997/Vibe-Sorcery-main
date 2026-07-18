import { useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { Button, ChipGroup, TextArea } from "../ui";
import { ConsentCheckbox } from "../legal/ConsentCheckbox";
import "./PublishDialog.scss";

export type PublishOptions = {
  allowRemix: boolean;
  license: "allow_remix" | "no_remix" | "attribution";
  contentComplianceAcknowledged: boolean;
};

type Props = {
  workTitle: string;
  onPublish: (caption: string, opts: PublishOptions) => Promise<void>;
  onClose: () => void;
};

export function PublishDialog({ workTitle, onPublish, onClose }: Props) {
  const { copy } = useLocale();
  const p = copy.publishUi;
  const l = copy.legalUi;
  const [caption, setCaption] = useState(p.defaultCaption.replace("{title}", workTitle));
  const [allowRemix, setAllowRemix] = useState(true);
  const [license, setLicense] = useState<PublishOptions["license"]>("allow_remix");
  const [compliance, setCompliance] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!compliance) {
      Taro.showToast({ title: l.mustAgree, icon: "none" });
      return;
    }
    setLoading(true);
    try {
      await onPublish(caption.trim() || p.defaultCaption.replace("{title}", workTitle), {
        allowRemix,
        license: allowRemix ? license : "no_remix",
        contentComplianceAcknowledged: true,
      });
      onClose();
    } catch {
      Taro.showToast({ title: p.fail, icon: "none" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="publish-dialog" onClick={onClose}>
      <View className="publish-dialog__sheet" onClick={(e) => e.stopPropagation()}>
        <Text className="publish-dialog__title">{p.title}</Text>
        <TextArea label={p.captionLabel} value={caption} onInput={(e) => setCaption(e.detail.value)} maxlength={200} />
        <Text className="publish-dialog__label">{p.remixLabel}</Text>
        <ChipGroup
          options={[
            { value: "yes", label: p.allowRemix },
            { value: "no", label: p.disallowRemix },
          ]}
          value={allowRemix ? "yes" : "no"}
          onChange={(v) => setAllowRemix(v === "yes")}
        />
        {allowRemix && (
          <>
            <Text className="publish-dialog__label">{p.licenseLabel}</Text>
            <ChipGroup
              options={[
                { value: "allow_remix", label: p.licenseAllow },
                { value: "attribution", label: p.licenseAttribution },
              ]}
              value={license}
              onChange={(v) => setLicense(v as PublishOptions["license"])}
            />
          </>
        )}
        <ConsentCheckbox checked={compliance} onChange={setCompliance}>
          {l.agreePublishCompliance}
        </ConsentCheckbox>
        <View className="publish-dialog__actions">
          <Button variant="primary" loading={loading} onClick={submit}>
            {p.submit}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {p.cancel}
          </Button>
        </View>
      </View>
    </View>
  );
}
