import { View, Image } from "@tarojs/components";
import { clsx } from "../../utils/clsx";
import "./AmbientBackdrop.scss";

type Props = {
  active?: boolean;
  coverUrl?: string;
  accentColor?: string;
  variant?: "default" | "netease";
  className?: string;
};

export function AmbientBackdrop({ active, coverUrl, accentColor, variant = "default", className }: Props) {
  return (
    <View
      className={clsx(
        "ambient-backdrop",
        active && "ambient-backdrop--active",
        variant === "netease" && "ambient-backdrop--netease",
        className
      )}
      aria-hidden
    >
      {coverUrl && <Image className="ambient-backdrop__cover" src={coverUrl} mode="aspectFill" />}
      {accentColor && (
        <View className="ambient-backdrop__tint" style={{ background: `radial-gradient(circle at 50% 30%, ${accentColor}55, transparent 70%)` }} />
      )}
      <View className="ambient-backdrop__overlay" />
      {variant === "default" && (
        <>
          <View className="ambient-backdrop__orb ambient-backdrop__orb--1" />
          <View className="ambient-backdrop__orb ambient-backdrop__orb--2" />
          <View className="ambient-backdrop__orb ambient-backdrop__orb--3" />
          <View className="ambient-backdrop__shimmer" />
        </>
      )}
    </View>
  );
}
