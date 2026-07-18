import { View, Text } from "@tarojs/components";
import { Icon, type IconName } from "./Icon";
import { clsx } from "../../utils/clsx";
import "./ModeTile.scss";

export type ModeTileItem = {
  id: string;
  icon: IconName;
  title: string;
  description: string;
  accent?: boolean;
};

type Props = ModeTileItem & {
  active?: boolean;
  onClick?: () => void;
};

export function ModeTile({ icon, title, description, active, accent, onClick }: Props) {
  return (
    <View className={clsx("ui-mode-tile", active && "ui-mode-tile--active", accent && "ui-mode-tile--accent")} onClick={onClick}>
      <View className="ui-mode-tile__icon">
        <Icon name={icon} accent={active || accent} size="lg" />
      </View>
      <Text className="ui-mode-tile__title">{title}</Text>
      <Text className="ui-mode-tile__desc">{description}</Text>
    </View>
  );
}

type GridProps = {
  items: ModeTileItem[];
  activeId?: string;
  layout?: "grid" | "rail";
  onSelect: (id: string) => void;
  className?: string;
};

export function ModeTileGrid({ items, activeId, layout = "grid", onSelect, className }: GridProps) {
  return (
    <View className={clsx("ui-mode-grid", layout === "rail" && "ui-mode-grid--rail", className)}>
      {items.map((item) => (
        <ModeTile key={item.id} {...item} active={activeId === item.id} onClick={() => onSelect(item.id)} />
      ))}
    </View>
  );
}
