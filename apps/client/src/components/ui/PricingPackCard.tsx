import { View, Text } from "@tarojs/components";
import { useLocale } from "@vibe-sorcery/i18n";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { clsx } from "../../utils/clsx";
import "./PricingPackCard.scss";

type Props = {
  label: string;
  price: string;
  featured?: boolean;
  badge?: string;
  children?: React.ReactNode;
};

export function PricingPackCard({ label, price, featured, badge, children }: Props) {
  const { copy } = useLocale();
  const p = copy.pricingUi;
  const badgeText = badge || (featured ? p.recommended : undefined);

  return (
    <View className={clsx("pricing-pack", featured && "pricing-pack--featured")}>
      {badgeText && <Badge tone="accent">{badgeText}</Badge>}
      <Text className="pricing-pack__label">{label}</Text>
      <Text className="pricing-pack__price">{price}</Text>
      <View className="pricing-pack__actions">{children}</View>
    </View>
  );
}
