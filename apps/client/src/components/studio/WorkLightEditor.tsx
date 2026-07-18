import { useState, useEffect } from "react";
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { Button } from "../ui";
import { vibeApi } from "../../services/api";
import { setItem } from "../../platform/storage";
import "./WorkLightEditor.scss";

type Props = {
  workId: string;
  title: string;
  bpm?: number;
  musicKey?: string;
  arousal?: number;
  valence?: number;
};

export function WorkLightEditor({ workId, title, bpm, musicKey, arousal, valence }: Props) {
  const { copy } = useLocale();
  const e = copy.lightEditorUi;
  const [hints, setHints] = useState<{
    bpm?: number | null;
    key?: string | null;
    arousal?: number | null;
    valence?: number | null;
    suggested_intent?: string;
  } | null>(null);

  useEffect(() => {
    vibeApi
      .getWorkRefineHints(workId)
      .then((res) => setHints(res))
      .catch(() => {});
  }, [workId]);

  const resolvedBpm = bpm ?? hints?.bpm ?? undefined;
  const resolvedKey = musicKey ?? hints?.key ?? undefined;
  const resolvedArousal = arousal ?? hints?.arousal ?? undefined;
  const resolvedValence = valence ?? hints?.valence ?? undefined;

  function refine() {
    setItem("create:seedWorkId", workId);
    setItem("create:seedIntent", hints?.suggested_intent || title);
    if (resolvedBpm) setItem("create:targetBpm", String(resolvedBpm));
    if (resolvedKey) setItem("create:targetKey", resolvedKey);
    Taro.switchTab({ url: "/pages/create/index" });
  }

  return (
    <View className="work-light-editor">
      <Text className="work-light-editor__title">{e.title}</Text>
      <View className="work-light-editor__meta">
        {resolvedBpm != null && <Text className="typo-meta">BPM {resolvedBpm}</Text>}
        {resolvedKey && <Text className="typo-meta">Key {resolvedKey}</Text>}
        {(resolvedArousal != null || resolvedValence != null) && (
          <Text className="typo-meta">A{resolvedArousal ?? "—"} V{resolvedValence ?? "—"}</Text>
        )}
      </View>
      <Button variant="secondary" size="sm" block onClick={refine}>
        {e.refine}
      </Button>
    </View>
  );
}
