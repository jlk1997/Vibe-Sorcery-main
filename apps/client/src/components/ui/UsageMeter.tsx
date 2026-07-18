import { View, Text } from "@tarojs/components";
import { Icon, type IconName } from "./Icon";
import "./UsageMeter.scss";

type Item = {
  id: string;
  icon: IconName;
  label: string;
  cost: number;
  maxCost?: number;
};

type Props = {
  items: Item[];
  unit: string;
};

export function UsageMeter({ items, unit }: Props) {
  const max = Math.max(...items.map((i) => i.cost), ...(items.map((i) => i.maxCost).filter(Boolean) as number[]), 3);

  return (
    <View className="ui-usage-meter">
      {items.map((item) => {
        const pct = (item.cost / max) * 100;
        return (
          <View key={item.id} className="ui-usage-meter__row">
            <View className="ui-usage-meter__icon">
              <Icon name={item.icon} accent size="sm" />
            </View>
            <View className="ui-usage-meter__body">
              <View className="ui-usage-meter__head">
                <Text className="ui-usage-meter__label">{item.label}</Text>
                <Text className="ui-usage-meter__cost">
                  {item.cost} {unit}
                </Text>
              </View>
              <View className="ui-usage-meter__track">
                <View className="ui-usage-meter__fill" style={{ width: `${pct}%` }} />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}
