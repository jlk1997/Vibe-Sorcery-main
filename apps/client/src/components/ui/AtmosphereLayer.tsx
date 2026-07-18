import { View } from "@tarojs/components";
import { clsx } from "../../utils/clsx";
import "./AtmosphereLayer.scss";

type Props = {
  variant?: "default" | "warm" | "cool" | "preset";
  intensity?: "low" | "medium" | "high";
  className?: string;
};

/** Ethereal atmosphere — gold/ether orbs driven by CSS vars */
export function AtmosphereLayer({ variant = "default", intensity = "medium", className }: Props) {
  return (
    <View
      className={clsx(
        "ui-atmosphere",
        `ui-atmosphere--${variant}`,
        `ui-atmosphere--${intensity}`,
        className
      )}
      aria-hidden
    >
      <View className="ui-atmosphere__veil" />
      <View className="ui-atmosphere__orb ui-atmosphere__orb--1" />
      <View className="ui-atmosphere__orb ui-atmosphere__orb--2" />
      <View className="ui-atmosphere__orb ui-atmosphere__orb--3" />
      <View className="ui-atmosphere__grain" />
      <View className="ui-atmosphere__vignette" />
    </View>
  );
}

/** @deprecated Use AtmosphereLayer */
export { AtmosphereLayer as AmbientMesh };
