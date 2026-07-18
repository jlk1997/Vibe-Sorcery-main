import { Input as TaroInput, InputProps, View } from "@tarojs/components";
import { Icon } from "./Icon";
import { clsx } from "../../utils/clsx";
import "./SearchField.scss";

type Props = Omit<InputProps, "className"> & {
  className?: string;
};

export function SearchField({ className, ...rest }: Props) {
  return (
    <View className={clsx("ui-search-field", className)}>
      <Icon name="search" accent className="ui-search-field__icon" />
      <TaroInput className="ui-search-field__input" {...rest} />
    </View>
  );
}
