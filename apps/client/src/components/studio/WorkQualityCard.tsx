import { useEffect, useMemo, useState } from "react";
import { View, Text } from "@tarojs/components";
import { useLocale } from "@vibe-sorcery/i18n";
import { Button, RingGauge } from "../ui";
import { vibeApi } from "../../services/api";
import "./WorkQualityCard.scss";

type Props = {
  workId: string;
  title?: string;
  moods?: string[];
  onOptimize?: (suggestion: string) => void;
};

export function WorkQualityCard({ workId, title, moods, onOptimize }: Props) {
  const { copy } = useLocale();
  const q = copy.qualityUi;
  const [scores, setScores] = useState<{ resonance: number; completion: number; suggestion_key: string } | null>(null);

  useEffect(() => {
    vibeApi
      .getWorkQuality(workId)
      .then(setScores)
      .catch(() => setScores(null));
  }, [workId]);

  const suggestion = useMemo(() => {
    const key = scores?.suggestion_key;
    if (key === "mood") return q.suggestMood;
    if (key === "structure") return q.suggestStructure;
    return q.suggestPublish;
  }, [scores, q]);

  const resonance = scores?.resonance ?? 80;
  const completion = scores?.completion ?? 80;

  return (
    <View className="work-quality">
      <Text className="work-quality__title">{q.title}</Text>
      <View className="work-quality__gauges">
        <View className="work-quality__gauge">
          <RingGauge value={resonance} max={100} label={q.resonance} />
        </View>
        <View className="work-quality__gauge">
          <RingGauge value={completion} max={100} label={q.completion} />
        </View>
      </View>
      {(moods?.length || title) && (
        <Text className="typo-meta">{q.moods.replace("{tags}", (moods || []).join(" · ") || title || "—")}</Text>
      )}
      <Text className="work-quality__hint">{suggestion}</Text>
      {onOptimize && (
        <Button variant="secondary" size="sm" block onClick={() => onOptimize(suggestion)}>
          {q.optimize}
        </Button>
      )}
    </View>
  );
}
