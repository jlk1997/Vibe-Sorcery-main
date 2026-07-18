import { useState } from "react";
import { View, Text, Button } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { analyzeEmotionUniversal, pickAudioFile, type EmotionAnalysis } from "../../platform/upload";
import "./AudioAnchorPanel.scss";

type Props = {
  onAnalysis: (result: EmotionAnalysis) => void;
};

export function AudioAnchorPanel({ onAnalysis }: Props) {
  const { copy } = useLocale();
  const j = copy.journeyUi;
  const [loading, setLoading] = useState(false);
  const [last, setLast] = useState<EmotionAnalysis | null>(null);

  async function analyze() {
    setLoading(true);
    try {
      const file = await pickAudioFile();
      const result = await analyzeEmotionUniversal(file);
      setLast(result);
      onAnalysis(result);
      Taro.showToast({ title: j.audioAnchorSuccess, icon: "success" });
    } catch {
      Taro.showToast({ title: j.audioAnchorFail, icon: "none" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="audio-anchor">
      <Text className="audio-anchor__title">{j.audioAnchorTitle}</Text>
      <Text className="audio-anchor__desc">{j.audioAnchorDesc}</Text>
      <Button className="audio-anchor__btn" loading={loading} onClick={analyze}>
        {j.audioAnchorPick}
      </Button>
      {last && (
        <View className="audio-anchor__result">
          <Text>
            {j.audioAnchorMoods}: {last.moods?.slice(0, 4).join(" · ") || "—"}
          </Text>
          {last.arousal != null && last.valence != null && (
            <Text>
              A{last.arousal.toFixed(1)} / V{last.valence.toFixed(1)}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
