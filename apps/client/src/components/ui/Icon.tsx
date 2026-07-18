import { Image, View } from "@tarojs/components";
import { clsx } from "../../utils/clsx";
import { iconSvgDataUri, ICON_PATHS } from "./iconPaths";
import "./Icon.scss";

export type IconName = keyof typeof ICON_PATHS;

type Props = {
  name: IconName;
  size?: "sm" | "md" | "lg" | "xl";
  accent?: boolean;
  muted?: boolean;
  /** 深色背景上的播放按钮等 */
  tone?: "light" | "dark";
  className?: string;
};

const SIZE_PX = { sm: 16, md: 20, lg: 24, xl: 32 } as const;

export function Icon({ name, size = "md", accent, muted, tone = "light", className }: Props) {
  const px = SIZE_PX[size];
  const color = accent
    ? "#d4af6a"
    : muted
      ? "rgba(255,255,255,0.4)"
      : tone === "dark"
        ? "#050508"
        : "rgba(255,255,255,0.88)";
  const src = iconSvgDataUri(name, color);

  return (
    <View
      className={clsx("ui-icon", `ui-icon--${size}`, accent && "ui-icon--accent", muted && "ui-icon--muted", className)}
    >
      <Image className="ui-icon__img" src={src} mode="aspectFit" style={{ width: `${px}px`, height: `${px}px` }} />
    </View>
  );
}
