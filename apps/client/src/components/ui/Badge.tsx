import { Text } from "@tarojs/components";
import { clsx } from "../../utils/clsx";
import "./ui.scss";

type Tone = "accent" | "success" | "warning" | "danger";

export function Badge({ children, tone = "accent", className }: { children: string; tone?: Tone; className?: string }) {
  return <Text className={clsx("ui-badge", `ui-badge--${tone}`, className)}>{children}</Text>;
}

export function Tag({ children, className }: { children: string; className?: string }) {
  return <Text className={clsx("ui-tag", className)}>{children}</Text>;
}
