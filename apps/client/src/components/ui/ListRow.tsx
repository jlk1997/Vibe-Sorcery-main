import { View, Text } from "@tarojs/components";
import { Icon, type IconName } from "./Icon";
import { clsx } from "../../utils/clsx";
import "./ListRow.scss";

type Props = {
  label: string;
  value?: string;
  hint?: string;
  icon?: IconName;
  badge?: number;
  danger?: boolean;
  onClick?: () => void;
  showArrow?: boolean;
};

export function ListRow({ label, value, hint, icon, badge, danger, onClick, showArrow = !!onClick }: Props) {
  return (
    <View className={clsx("ui-list-row", danger && "ui-list-row--danger", onClick && "ui-list-row--clickable")} onClick={onClick}>
      {icon && (
        <View className="ui-list-row__icon">
          <Icon name={icon} accent={!danger} />
        </View>
      )}
      <View className="ui-list-row__main">
        <Text className="ui-list-row__label">{label}</Text>
        {hint && <Text className="ui-list-row__hint">{hint}</Text>}
      </View>
      {badge != null && badge > 0 && <Text className="ui-list-row__badge">{badge > 99 ? "99+" : badge}</Text>}
      {value && <Text className="ui-list-row__value">{value}</Text>}
      {showArrow && <Text className="ui-list-row__arrow">›</Text>}
    </View>
  );
}
