import { View } from "@tarojs/components";
import { clsx } from "../../utils/clsx";
import "./ui.scss";

type Props = { count?: number; rows?: number; variant?: "card" | "line" };

export function LoadingSkeleton({ count, rows, variant = "card" }: Props) {
  const n = count ?? rows ?? 3;
  return (
    <>
      {Array.from({ length: n }).map((_, i) => (
        <View key={i} className={clsx("ui-skeleton", variant === "card" ? "ui-skeleton--card" : "ui-skeleton--line")} />
      ))}
    </>
  );
}
