import { View, Text } from "@tarojs/components";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { clsx } from "../../utils/clsx";
import "./ui.scss";

type Props = {
  icon?: string;
  iconName?: IconName;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
};

export function EmptyState({ icon = "♪", iconName, title, description, actionLabel, onAction, className }: Props) {
  return (
    <View className={clsx("ui-empty", className)}>
      <View className="ui-empty__orb">
        {iconName ? <Icon name={iconName} size="lg" accent /> : <Text className="ui-empty__icon">{icon}</Text>}
      </View>
      <Text className="ui-empty__title">{title}</Text>
      {description && <Text className="ui-empty__desc">{description}</Text>}
      {actionLabel && onAction && (
        <Button variant="primary" onClick={onAction} className="ui-empty__action">
          {actionLabel}
        </Button>
      )}
    </View>
  );
}
