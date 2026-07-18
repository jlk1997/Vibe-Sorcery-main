import { View, Image } from "@tarojs/components";
import { clsx } from "../../utils/clsx";
import "./ImmersiveCover.scss";

type Props = {
  coverUrl?: string;
  height?: number | string;
  className?: string;
  children?: React.ReactNode;
};

export function ImmersiveCover({ coverUrl, height = "360rpx", className, children }: Props) {
  return (
    <View className={clsx("ui-immersive-cover", className)} style={{ height }}>
      {coverUrl ? (
        <>
          <Image className="ui-immersive-cover__bg" src={coverUrl} mode="aspectFill" />
          <View className="ui-immersive-cover__blur" />
        </>
      ) : (
        <View className="ui-immersive-cover__fallback" />
      )}
      <View className="ui-immersive-cover__gradient" />
      {children && <View className="ui-immersive-cover__content">{children}</View>}
    </View>
  );
}
