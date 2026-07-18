import { useEffect, useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { Button, ChipGroup, TextArea } from "../ui";
import { vibeApi } from "../../services/api";
import { setItem, removeItem } from "../../platform/storage";
import { canRemixWork } from "../../utils/remixLicense";
import "./DerivativeSheet.scss";

export type DerivativeMode = "remix" | "cover" | "variation";

type Props = {
  workId: string;
  workTitle: string;
  initialMode?: DerivativeMode;
  onClose: () => void;
};

export function DerivativeSheet({ workId, workTitle, initialMode = "remix", onClose }: Props) {
  const { copy } = useLocale();
  const d = copy.derivative;
  const c = copy.createUi;
  const [mode, setMode] = useState<DerivativeMode>(initialMode);
  const [intent, setIntent] = useState(initialMode === "remix" ? d.remix.example : "");
  const [preview, setPreview] = useState<{ prompt?: string; bpm?: number; key?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [remixAllowed, setRemixAllowed] = useState(true);

  useEffect(() => {
    let cancelled = false;
    vibeApi
      .getWork(workId)
      .then((w) => {
        if (!cancelled) setRemixAllowed(canRemixWork(w));
      })
      .catch(() => {
        if (!cancelled) setRemixAllowed(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workId]);

  async function runPreview() {
    if (mode !== "remix" || !intent.trim()) return;
    setLoading(true);
    try {
      setPreview(await vibeApi.previewRemix(workId, intent.trim()));
      Taro.showToast({ title: copy.settingsUi.previewDone, icon: "success" });
    } catch {
      Taro.showToast({ title: d.previewFail, icon: "none" });
    } finally {
      setLoading(false);
    }
  }

  function start() {
    if (mode === "remix" && !remixAllowed) {
      Taro.showToast({ title: d.remixNotAllowed, icon: "none" });
      return;
    }
    setItem("create:seedWorkId", workId);
    setItem("create:mode", mode);
    setItem("create:seedTitle", workTitle);
    if (intent.trim()) setItem("create:seedIntent", intent.trim());
    else if (mode === "remix") setItem("create:seedIntent", d.remix.example);
    else removeItem("create:seedIntent");
    onClose();
    Taro.switchTab({ url: "/pages/create/index" });
  }

  return (
    <View className="derivative-sheet" onClick={onClose}>
      <View className="derivative-sheet__panel" onClick={(e) => e.stopPropagation()}>
        <View className="derivative-sheet__handle" />
        <Text className="derivative-sheet__title">{d.selectAction}</Text>
        <Text className="derivative-sheet__work">{workTitle}</Text>
        <ChipGroup
          options={[
            { value: "remix", label: d.remix.short },
            { value: "cover", label: d.cover.short },
            { value: "variation", label: copy.createUi.modeVariation },
          ]}
          value={mode}
          onChange={(v) => {
            const next = v as DerivativeMode;
            setMode(next);
            setPreview(null);
            if (next === "remix" && !intent.trim()) setIntent(d.remix.example);
          }}
        />
        <Text className="derivative-sheet__desc">
          {mode === "remix" ? d.remix.description : mode === "cover" ? d.cover.description : copy.createUi.modeVariationDesc}
        </Text>
        {mode === "variation" && (
          <Text className="typo-meta">{copy.pricingUi.ruleSingle} ×3 {copy.pricingUi.creditUnit}</Text>
        )}
        {mode === "remix" && !remixAllowed && (
          <Text className="derivative-sheet__blocked typo-meta">{d.remixNotAllowed}</Text>
        )}
        <TextArea
          label={d.intentLabel}
          placeholder={d.intentPlaceholder}
          value={intent}
          onInput={(e) => setIntent(e.detail.value)}
          maxlength={300}
        />
        {preview && (
          <View className="derivative-sheet__preview">
            <Text className="typo-meta">{preview.prompt}</Text>
            {preview.bpm != null && <Text className="typo-meta">BPM {preview.bpm} · {preview.key}</Text>}
          </View>
        )}
        <View className="derivative-sheet__actions">
          {mode === "remix" && remixAllowed && (
            <Button variant="secondary" block loading={loading} onClick={runPreview}>
              {c.remixPreview}
            </Button>
          )}
          <Button variant="primary" block onClick={start} disabled={mode === "remix" && !remixAllowed}>
            {mode === "remix" ? d.startRemix : mode === "cover" ? d.startCover : copy.createUi.modeVariation}
          </Button>
          <Button variant="ghost" block onClick={onClose}>
            {copy.actions.cancel}
          </Button>
        </View>
      </View>
    </View>
  );
}
