import { View, Text } from "@tarojs/components";
import type { Waypoint } from "@vibe-sorcery/types";
import { clsx } from "../../utils/clsx";
import "./WaypointTimeline.scss";

type Props = {
  waypoints: Waypoint[];
  className?: string;
};

function nodeColor(valence: number, arousal: number) {
  const hue = 160 + (valence / 10) * 80 - (arousal / 10) * 20;
  const light = 45 + (valence / 10) * 15;
  return `hsl(${hue}, 65%, ${light}%)`;
}

export function WaypointTimeline({ waypoints, className }: Props) {
  if (waypoints.length === 0) return null;

  return (
    <View className={clsx("waypoint-timeline", className)}>
      <View className="waypoint-timeline__track">
        {waypoints.map((wp, i) => {
          const isLast = i === waypoints.length - 1;
          return (
            <View key={wp.step ?? i} className="waypoint-timeline__node-wrap">
              {!isLast && <View className="waypoint-timeline__connector" />}
              <View
                className="waypoint-timeline__node"
                style={{
                  background: nodeColor(wp.valence, wp.arousal),
                  boxShadow: `0 0 20rpx ${nodeColor(wp.valence, wp.arousal)}`,
                }}
              >
                <Text className="waypoint-timeline__step">{i + 1}</Text>
              </View>
              <Text className="waypoint-timeline__label">{wp.description || `#${i + 1}`}</Text>
              <Text className="waypoint-timeline__meta">
                V{wp.valence} · A{wp.arousal}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
