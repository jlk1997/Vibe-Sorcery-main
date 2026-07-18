import { View, Text } from "@tarojs/components";
import { clsx } from "../../utils/clsx";
import "./RitualTimeline.scss";

export type RitualStep = {
  id: string;
  label: string;
};

type Props = {
  steps: RitualStep[];
  current: number;
  className?: string;
};

export function RitualTimeline({ steps, current, className }: Props) {
  return (
    <View className={clsx("ritual-timeline", className)}>
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <View key={step.id} className="ritual-timeline__item">
            <View className="ritual-timeline__rail">
              {i > 0 && <View className={clsx("ritual-timeline__line", (done || active) && "ritual-timeline__line--on")} />}
              <View
                className={clsx(
                  "ritual-timeline__node",
                  done && "ritual-timeline__node--done",
                  active && "ritual-timeline__node--active"
                )}
              >
                {done ? <Text className="ritual-timeline__check">✓</Text> : <Text className="ritual-timeline__num">{i + 1}</Text>}
              </View>
            </View>
            <Text className={clsx("ritual-timeline__label", active && "ritual-timeline__label--active", done && "ritual-timeline__label--done")}>
              {step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
