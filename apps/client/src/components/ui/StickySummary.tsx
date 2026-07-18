import { PropsWithChildren } from "react";
import { View, Text } from "@tarojs/components";
import { Button } from "./Button";
import { clsx } from "../../utils/clsx";
import "./StickySummary.scss";

type Props = PropsWithChildren<{
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaDisabled?: boolean;
  onCta?: () => void;
  className?: string;
}>;

export function StickySummary({
  title,
  subtitle,
  ctaLabel,
  ctaDisabled,
  onCta,
  className,
  children,
}: Props) {
  return (
    <View className={clsx("ui-sticky-summary", className)}>
      <View className="ui-sticky-summary__main">
        <Text className="ui-sticky-summary__title">{title}</Text>
        {subtitle && <Text className="ui-sticky-summary__subtitle">{subtitle}</Text>}
        {children}
      </View>
      {ctaLabel && onCta && (
        <Button variant="primary" size="sm" disabled={ctaDisabled} onClick={onCta}>
          {ctaLabel}
        </Button>
      )}
    </View>
  );
}
