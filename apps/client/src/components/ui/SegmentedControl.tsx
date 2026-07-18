import { View, Text } from "@tarojs/components";
import { clsx } from "../../utils/clsx";
import "./SegmentedControl.scss";

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
};

export function SegmentedControl<T extends string>({ options, value, onChange, className }: Props<T>) {
  return (
    <View className={clsx("ui-segmented", className)}>
      {options.map((o) => (
        <Text
          key={o.value}
          className={clsx("ui-segmented__item", value === o.value && "ui-segmented__item--active")}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </Text>
      ))}
    </View>
  );
}
