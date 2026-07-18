import { View, Text } from "@tarojs/components";
import { clsx } from "../../utils/clsx";
import "./ui.scss";

type Tone = "info" | "success" | "error" | "loading";

export function StatusLine({ tone = "info", children }: { tone?: Tone; children: string }) {
  return (
    <View className={clsx("ui-status", `ui-status--${tone}`)}>
      <Text>{children}</Text>
    </View>
  );
}
