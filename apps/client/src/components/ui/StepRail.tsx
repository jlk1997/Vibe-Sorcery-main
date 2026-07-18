import { View, Text } from "@tarojs/components";
import { Icon, type IconName } from "./Icon";
import { clsx } from "../../utils/clsx";
import "./StepRail.scss";

export type StepRailItem = {
  id: string;
  label: string;
  icon?: IconName;
};

type Props = {
  steps: StepRailItem[];
  current: number;
  className?: string;
};

export function StepRail({ steps, current, className }: Props) {
  return (
    <View className={clsx("ui-step-rail", className)}>
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <View key={step.id} className="ui-step-rail__item">
            {i > 0 && <View className={clsx("ui-step-rail__line", (done || active) && "ui-step-rail__line--on")} />}
            <View className={clsx("ui-step-rail__node", done && "ui-step-rail__node--done", active && "ui-step-rail__node--active")}>
              {done ? (
                <Text className="ui-step-rail__check">✓</Text>
              ) : step.icon ? (
                <Icon name={step.icon} size="sm" accent={active} />
              ) : (
                <Text className="ui-step-rail__num">{i + 1}</Text>
              )}
            </View>
            <Text className={clsx("ui-step-rail__label", active && "ui-step-rail__label--active")}>{step.label}</Text>
          </View>
        );
      })}
    </View>
  );
}
