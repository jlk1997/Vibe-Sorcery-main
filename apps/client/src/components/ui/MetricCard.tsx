import { View, Text } from "@tarojs/components";
import { Icon, type IconName } from "./Icon";
import { clsx } from "../../utils/clsx";
import "./MetricCard.scss";

type Variant = "accent" | "info" | "warning";

type Props = {
  icon: IconName;
  value: string | number;
  label: string;
  variant?: Variant;
  onClick?: () => void;
};

export function MetricCard({ icon, value, label, variant = "accent", onClick }: Props) {
  return (
    <View className={clsx("ui-metric-card", `ui-metric-card--${variant}`, onClick && "ui-metric-card--clickable")} onClick={onClick}>
      <View className="ui-metric-card__icon-wrap">
        <Icon name={icon} size="md" accent />
      </View>
      <Text className="ui-metric-card__value">{value}</Text>
      <Text className="ui-metric-card__label">{label}</Text>
      <View className="ui-metric-card__bar" />
    </View>
  );
}
