import { View, Text } from "@tarojs/components";
import { useLocale } from "@vibe-sorcery/i18n";
import { workToPlayerTrack } from "@vibe-sorcery/types";
import { PlayTrackButton } from "../player/PlayTrackButton";
import "./VariationLab.scss";

export type VariationWork = {
  id: string;
  title: string;
  audio_url?: string;
  hls_url?: string;
  cover_url?: string;
};

type Props = {
  works: VariationWork[];
  selectedId?: string | null;
  onSelect?: (workId: string) => void;
};

export function VariationLab({ works, selectedId, onSelect }: Props) {
  const { copy } = useLocale();
  const v = copy.variationLabUi;
  if (!works.length) return null;

  return (
    <View className="variation-lab">
      <Text className="variation-lab__title">{v.title}</Text>
      <View className="variation-lab__grid">
        {works.map((w) => (
          <View
            key={w.id}
            className={`variation-lab__cell ${selectedId === w.id ? "variation-lab__cell--active" : ""}`}
            onClick={() => onSelect?.(w.id)}
          >
            <Text className="variation-lab__label">{w.title}</Text>
            {w.audio_url && (
              <PlayTrackButton
                track={workToPlayerTrack(w, { source: "generation" })}
                label={v.play}
                size="sm"
              />
            )}
          </View>
        ))}
      </View>
    </View>
  );
}
