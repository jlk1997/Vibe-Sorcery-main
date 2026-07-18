import { View, Text } from "@tarojs/components";
import { clsx } from "../../utils/clsx";
import "./ui.scss";

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
};

export function ChipGroup<T extends string>({ options, value, onChange, className }: Props<T>) {
  return (
    <View className={clsx("ui-chip-group", className)}>
      {options.map((o) => (
        <Text
          key={o.value}
          className={clsx("ui-chip", value === o.value && "ui-chip--active")}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </Text>
      ))}
    </View>
  );
}
