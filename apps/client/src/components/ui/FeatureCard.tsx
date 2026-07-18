import { View, Text } from "@tarojs/components";
import { Icon, type IconName } from "./Icon";
import "./FeatureCard.scss";

type Props = {
  icon: IconName;
  title: string;
  description: string;
  onClick?: () => void;
};

export function FeatureCard({ icon, title, description, onClick }: Props) {
  return (
    <View className={`ui-feature-card ${onClick ? "ui-feature-card--clickable" : ""}`} onClick={onClick}>
      <View className="ui-feature-card__icon">
        <Icon name={icon} size="lg" accent />
      </View>
      <View className="ui-feature-card__body">
        <Text className="ui-feature-card__title">{title}</Text>
        <Text className="ui-feature-card__desc">{description}</Text>
      </View>
    </View>
  );
}
