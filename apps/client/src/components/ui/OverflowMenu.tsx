import { View, Text } from "@tarojs/components";
import { BottomSheet } from "./BottomSheet";
import { Icon, type IconName } from "./Icon";
import "./OverflowMenu.scss";

export type OverflowMenuItem = {
  id: string;
  icon?: IconName;
  label: string;
  danger?: boolean;
  onClick: () => void;
};

type Props = {
  open: boolean;
  title?: string;
  items: OverflowMenuItem[];
  onClose: () => void;
};

export function OverflowMenu({ open, title, items, onClose }: Props) {
  return (
    <BottomSheet open={open} title={title} onClose={onClose}>
      <View className="ui-overflow-menu">
        {items.length === 0 ? (
          <Text className="ui-overflow-menu__empty">—</Text>
        ) : (
          items.map((item) => (
            <View
              key={item.id}
              className={`ui-overflow-item ${item.danger ? "ui-overflow-item--danger" : ""}`}
              onClick={() => {
                item.onClick();
                onClose();
              }}
            >
              {item.icon && <Icon name={item.icon} size="sm" accent={!item.danger} />}
              <Text className="ui-overflow-item__label">{item.label}</Text>
            </View>
          ))
        )}
      </View>
    </BottomSheet>
  );
}
