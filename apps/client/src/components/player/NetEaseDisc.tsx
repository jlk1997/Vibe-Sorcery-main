import { View, Image } from "@tarojs/components";
import { clsx } from "../../utils/clsx";
import "./NetEaseDisc.scss";

type Props = {
  coverUrl?: string;
  playing?: boolean;
  className?: string;
};

/** 网易云风格：黑胶盘 + 唱针臂，播放时旋转并落针 */
export function NetEaseDisc({ coverUrl, playing, className }: Props) {
  return (
    <View className={clsx("netease-disc", playing && "netease-disc--playing", className)}>
      <View className={clsx("netease-disc__arm", playing && "netease-disc__arm--down")}>
        <View className="netease-disc__arm-pivot" />
        <View className="netease-disc__arm-bar" />
        <View className="netease-disc__arm-head" />
      </View>
      <View className="netease-disc__shadow" />
      <View className={clsx("netease-disc__plate", playing && "netease-disc__plate--spin")}>
        <View className="netease-disc__groove" />
        {coverUrl ? (
          <Image className="netease-disc__cover" src={coverUrl} mode="aspectFill" />
        ) : (
          <View className="netease-disc__cover netease-disc__cover--fallback" />
        )}
      </View>
    </View>
  );
}
