import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { Button } from "../ui";
import "./ReferenceTrackPicker.scss";

type WorkOption = { id: string; title: string; cover_url?: string };

type AvOffset = { arousal: number; valence: number };

type Props = {
  works: WorkOption[];
  selectedId?: string | null;
  avOffset?: AvOffset;
  onSelect: (workId: string | null) => void;
  onOffsetChange?: (offset: AvOffset) => void;
  loading?: boolean;
};

const AROUSAL_OPTS = [
  { v: -2, key: "arousalCalm" as const },
  { v: 0, key: "arousalKeep" as const },
  { v: 2, key: "arousalEnergy" as const },
];
const VALENCE_OPTS = [
  { v: -2, key: "valenceDark" as const },
  { v: 0, key: "valenceKeep" as const },
  { v: 2, key: "valenceBright" as const },
];

export function ReferenceTrackPicker({ works, selectedId, avOffset, onSelect, onOffsetChange, loading }: Props) {
  const { copy } = useLocale();
  const rt = copy.referenceTrack;
  const offset = avOffset ?? { arousal: 0, valence: 0 };

  return (
    <View className="ref-track-picker">
      <Text className="ref-track-picker__title">{rt.label}</Text>
      <Text className="ref-track-picker__hint">{rt.hint}</Text>
      {loading && <Text className="typo-meta">…</Text>}
      {!loading && works.length === 0 && (
        <Button variant="secondary" size="sm" onClick={() => Taro.switchTab({ url: "/pages/library/index" })}>
          {rt.none}
        </Button>
      )}
      <View className="ref-track-picker__list">
        {works.map((w) => (
          <View
            key={w.id}
            className={`ref-track-picker__item ${selectedId === w.id ? "ref-track-picker__item--active" : ""}`}
            onClick={() => onSelect(selectedId === w.id ? null : w.id)}
          >
            <Text className="ref-track-picker__label">{w.title}</Text>
          </View>
        ))}
      </View>
      {selectedId && onOffsetChange && (
        <View className="ref-track-picker__offsets">
          <Text className="ref-track-picker__offset-label">{rt.arousalOffset}</Text>
          <View className="ref-track-picker__chips">
            {AROUSAL_OPTS.map((o) => (
              <Text
                key={o.key}
                className={`ref-track-picker__chip ${offset.arousal === o.v ? "ref-track-picker__chip--on" : ""}`}
                onClick={() => onOffsetChange({ ...offset, arousal: o.v })}
              >
                {rt[o.key]}
              </Text>
            ))}
          </View>
          <Text className="ref-track-picker__offset-label">{rt.valenceOffset}</Text>
          <View className="ref-track-picker__chips">
            {VALENCE_OPTS.map((o) => (
              <Text
                key={o.key}
                className={`ref-track-picker__chip ${offset.valence === o.v ? "ref-track-picker__chip--on" : ""}`}
                onClick={() => onOffsetChange({ ...offset, valence: o.v })}
              >
                {rt[o.key]}
              </Text>
            ))}
          </View>
        </View>
      )}
      {selectedId && (
        <Button variant="ghost" size="sm" onClick={() => onSelect(null)}>
          {rt.none}
        </Button>
      )}
    </View>
  );
}
