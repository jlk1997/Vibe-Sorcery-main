import { ReactNode } from "react";
import { View, Text } from "@tarojs/components";
import { clsx } from "../../utils/clsx";
import "./PageHeader.scss";

type Props = {
  title: string;
  subtitle?: string;
  label?: string;
  actions?: ReactNode;
  immersive?: boolean;
  /** tab = bottom tab screens; stack = secondary pages */
  variant?: "tab" | "stack";
  className?: string;
};

export function PageHeader({ title, subtitle, label, actions, immersive, variant = "stack", className }: Props) {
  return (
    <View
      className={clsx(
        "ui-page-header",
        immersive && "ui-page-header--immersive",
        variant === "tab" && "ui-page-header--tab",
        className
      )}
    >
      <View className="ui-page-header__main">
        {label && <Text className="ui-page-header__label">{label}</Text>}
        <Text className="ui-page-header__title">{title}</Text>
        {subtitle && <Text className="ui-page-header__subtitle">{subtitle}</Text>}
      </View>
      {actions && <View className="ui-page-header__actions">{actions}</View>}
    </View>
  );
}
