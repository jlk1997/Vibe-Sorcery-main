import { View, Text } from "@tarojs/components";
import { Icon, IconName } from "./Icon";
import { clsx } from "../../utils/clsx";
import "./ActionBar.scss";

export type ActionItem = {
  id: string;
  icon: IconName;
  label?: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
};

type Props = {
  actions: ActionItem[];
  className?: string;
  compact?: boolean;
};

export function ActionBar({ actions, className, compact }: Props) {
  return (
    <View className={clsx("ui-action-bar", compact && "ui-action-bar--compact", className)}>
      {actions.map((a) => (
        <View
          key={a.id}
          className={clsx("ui-action-bar__item", a.active && "ui-action-bar__item--active")}
          onClick={a.onClick}
        >
          <Icon name={a.icon} accent={a.active} size={compact ? "sm" : "md"} />
          {(a.count != null || a.label) && (
            <Text className="ui-action-bar__meta">
              {a.count != null ? a.count : a.label}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}
