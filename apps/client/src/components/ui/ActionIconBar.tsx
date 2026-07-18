import { View, Text } from "@tarojs/components";
import { Icon, type IconName } from "./Icon";
import { clsx } from "../../utils/clsx";
import "./ActionIconBar.scss";

export type ActionIconItem = {
  id: string;
  icon: IconName;
  label?: string;
  count?: number;
  active?: boolean;
  accent?: boolean;
  primary?: boolean;
  onClick?: () => void;
};

type Props = {
  items: ActionIconItem[];
  className?: string;
};

/** Feed 卡片底部横向 icon 操作栏 */
export function ActionIconBar({ items, className }: Props) {
  return (
    <View className={clsx("ui-action-bar", className)}>
      {items.map((item) => (
        <View
          key={item.id}
          className={clsx(
            "ui-action-bar__item",
            item.primary && "ui-action-bar__item--primary",
            item.active && "ui-action-bar__item--active"
          )}
          onClick={(e) => {
            e.stopPropagation();
            item.onClick?.();
          }}
        >
          <Icon
            name={item.icon}
            size={item.primary ? "md" : "sm"}
            tone={item.primary ? "dark" : "light"}
            accent={!item.primary && (item.accent || item.active)}
          />
          {item.count != null && item.count > 0 && <Text className="ui-action-bar__count">{item.count}</Text>}
        </View>
      ))}
    </View>
  );
}
