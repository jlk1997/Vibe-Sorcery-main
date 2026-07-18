import { View, Text, Image } from "@tarojs/components";
import { Icon } from "./Icon";
import { clsx } from "../../utils/clsx";
import "./TrackRow.scss";

type Props = {
  title: string;
  subtitle?: string;
  coverUrl?: string;
  index?: number;
  active?: boolean;
  onClick?: () => void;
  onPlay?: () => void;
  onMenu?: () => void;
  className?: string;
};

export function TrackRow({ title, subtitle, coverUrl, index, active, onClick, onPlay, onMenu, className }: Props) {
  return (
    <View className={clsx("ui-track-row", active && "ui-track-row--active", className)} onClick={onClick}>
      {index != null && <Text className="ui-track-row__index">{index}</Text>}
      {coverUrl ? (
        <Image className="ui-track-row__cover" src={coverUrl} mode="aspectFill" />
      ) : (
        <View className="ui-track-row__cover ui-track-row__cover--fallback">
          <Icon name="music" accent />
        </View>
      )}
      <View className="ui-track-row__info">
        <Text className="ui-track-row__title">{title}</Text>
        {subtitle && <Text className="ui-track-row__subtitle">{subtitle}</Text>}
      </View>
      {onPlay && (
        <View
          className="ui-track-row__play"
          onClick={(e) => {
            e.stopPropagation();
            onPlay();
          }}
        >
          <Icon name="play" accent />
        </View>
      )}
      {onMenu && (
        <View
          className="ui-track-row__menu"
          onClick={(e) => {
            e.stopPropagation();
            onMenu();
          }}
        >
          <Icon name="more" />
        </View>
      )}
    </View>
  );
}
