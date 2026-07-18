import { View, Text } from "@tarojs/components";
import { clsx } from "../../utils/clsx";
import "./CreditBarChart.scss";

type Item = {
  id: string;
  label: string;
  credits: number;
  price?: number;
  featured?: boolean;
};

type Props = {
  items: Item[];
  unit?: string;
};

export function CreditBarChart({ items, unit = "" }: Props) {
  const max = Math.max(...items.map((i) => i.credits), 1);

  return (
    <View className="ui-credit-chart">
      {items.map((item) => {
        const pct = (item.credits / max) * 100;
        return (
          <View key={item.id} className={clsx("ui-credit-chart__row", item.featured && "ui-credit-chart__row--featured")}>
            <View className="ui-credit-chart__head">
              <Text className="ui-credit-chart__label">{item.label}</Text>
              <Text className="ui-credit-chart__value">
                {item.credits}
                {unit ? ` ${unit}` : ""}
                {item.price != null && <Text className="ui-credit-chart__price"> · ¥{item.price}</Text>}
              </Text>
            </View>
            <View className="ui-credit-chart__track">
              <View className="ui-credit-chart__fill" style={{ width: `${pct}%` }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}
