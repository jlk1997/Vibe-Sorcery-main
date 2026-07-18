import { View, Text } from "@tarojs/components";
import { useLocale } from "@vibe-sorcery/i18n";
import type { Waypoint } from "@vibe-sorcery/types";
import "./JourneyValuePreview.scss";

type Props = {
  waypoints: Waypoint[];
  trackCount: number;
};

export function JourneyValuePreview({ waypoints, trackCount }: Props) {
  const { copy } = useLocale();
  const j = copy.journeyUi;
  if (!waypoints.length) return null;

  const first = waypoints[0];
  const last = waypoints[waypoints.length - 1];

  return (
    <View className="journey-preview">
      <Text className="journey-preview__title">{j.valuePreviewTitle}</Text>
      <Text className="typo-meta">{j.valuePreviewDesc.replace("{n}", String(trackCount))}</Text>
      <View className="journey-preview__curve">
        {waypoints.map((wp, i) => (
          <View
            key={i}
            className="journey-preview__dot"
            style={{
              left: `${(i / Math.max(waypoints.length - 1, 1)) * 100}%`,
              bottom: `${((wp.valence ?? 3) / 5) * 80}%`,
            }}
          />
        ))}
      </View>
      <View className="journey-preview__labels">
        <Text className="typo-meta">A{first.arousal ?? "—"} V{first.valence ?? "—"}</Text>
        <Text className="typo-meta">→</Text>
        <Text className="typo-meta">A{last.arousal ?? "—"} V{last.valence ?? "—"}</Text>
      </View>
    </View>
  );
}
