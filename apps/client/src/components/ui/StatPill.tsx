import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { clsx } from "../../utils/clsx";
import "./StatPill.scss";

type Props = {
  label: string;
  value?: string | number;
  variant?: "accent" | "muted" | "danger";
  pulse?: boolean;
  onClick?: () => void;
  href?: string;
  className?: string;
};

export function StatPill({ label, value, variant = "accent", pulse, onClick, href, className }: Props) {
  const handleClick = () => {
    if (onClick) onClick();
    else if (href) Taro.navigateTo({ url: href });
  };

  const content = value != null ? `${label}: ${value}` : label;

  return (
    <View
      className={clsx("ui-stat-pill", `ui-stat-pill--${variant}`, pulse && "ui-stat-pill--pulse", className)}
      onClick={onClick || href ? handleClick : undefined}
    >
      <Text className="ui-stat-pill__text">{content}</Text>
    </View>
  );
}
