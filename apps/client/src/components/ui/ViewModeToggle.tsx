import { View } from "@tarojs/components";
import { Icon, type IconName } from "./Icon";
import { clsx } from "../../utils/clsx";
import "./ViewModeToggle.scss";

type Option = {
  value: string;
  icon: IconName;
  label: string;
};

type Props = {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
};

export function ViewModeToggle({ options, value, onChange }: Props) {
  return (
    <View className="ui-view-toggle" role="tablist">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <View
            key={opt.value}
            className={clsx("ui-view-toggle__btn", active && "ui-view-toggle__btn--active")}
            onClick={() => onChange(opt.value)}
            aria-selected={active}
          >
            <Icon name={opt.icon} size="sm" accent={active} />
          </View>
        );
      })}
    </View>
  );
}
