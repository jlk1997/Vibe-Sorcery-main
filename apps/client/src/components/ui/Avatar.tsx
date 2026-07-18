import { View, Text, Image } from "@tarojs/components";
import { clsx } from "../../utils/clsx";
import "./Avatar.scss";

type Props = {
  name?: string;
  src?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

function initials(name?: string) {
  if (!name) return "?";
  return name.slice(0, 1).toUpperCase();
}

export function Avatar({ name, src, size = "md", className }: Props) {
  return (
    <View className={clsx("ui-avatar", `ui-avatar--${size}`, className)}>
      {src ? (
        <Image className="ui-avatar__img" src={src} mode="aspectFill" />
      ) : (
        <Text className="ui-avatar__initial">{initials(name)}</Text>
      )}
    </View>
  );
}
