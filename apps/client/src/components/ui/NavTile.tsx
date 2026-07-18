import { View, Text } from "@tarojs/components";
import { Icon, type IconName } from "./Icon";
import { clsx } from "../../utils/clsx";
import "./NavTile.scss";

type Props = {
  icon: IconName;
  label: string;
  badge?: number;
  tone?: "accent" | "info" | "warm" | "neutral";
  onClick?: () => void;
};

const TONE_CLASS = {
  accent: "ui-nav-tile--accent",
  info: "ui-nav-tile--info",
  warm: "ui-nav-tile--warm",
  neutral: "ui-nav-tile--neutral",
} as const;

export function NavTile({ icon, label, badge, tone = "accent", onClick }: Props) {
  return (
    <View className={clsx("ui-nav-tile", TONE_CLASS[tone])} onClick={onClick}>
      <View className="ui-nav-tile__icon">
        <Icon name={icon} size="md" accent />
      </View>
      <Text className="ui-nav-tile__label">{label}</Text>
      {badge != null && badge > 0 && <Text className="ui-nav-tile__badge">{badge > 99 ? "99+" : badge}</Text>}
    </View>
  );
}
