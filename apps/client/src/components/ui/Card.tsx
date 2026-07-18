import { PropsWithChildren, ReactNode } from "react";
import { View, Text } from "@tarojs/components";
import { clsx } from "../../utils/clsx";
import "./ui.scss";

type Props = PropsWithChildren<{
  title?: string;
  subtitle?: string;
  flat?: boolean;
  className?: string;
  header?: ReactNode;
}>;

export function Card({ title, subtitle, flat, className, header, children }: Props) {
  return (
    <View className={clsx("ui-card", flat && "ui-card--flat", className)}>
      {header}
      {title && <Text className="ui-card__title">{title}</Text>}
      {subtitle && <Text className="ui-card__subtitle">{subtitle}</Text>}
      {children}
    </View>
  );
}
