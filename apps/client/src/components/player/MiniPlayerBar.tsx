import { useEffect } from "react";
import { View, Text, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { STACK_PAGE_ROUTES } from "../../constants/routes";
import { moodAccent } from "@vibe-sorcery/types";
import { usePlayer } from "../../contexts/PlayerProvider";
import { extractCoverAccent, useTheme } from "../../contexts/ThemeProvider";
import { currentLayoutRoute } from "../../constants/routes";
import { useLayoutVars } from "../../contexts/LayoutVarsProvider";
import { useRouteTick } from "../../hooks/useRouteTick";
import { Icon } from "../ui";
import { clsx } from "../../utils/clsx";
import "./MiniPlayerBar.scss";

function currentRoute(): string {
  return currentLayoutRoute();
}

/** 网易云风格底部迷你播放条 */
export function MiniPlayerBar() {
  const { currentTrack, isPlaying, currentTime, duration, togglePlay } = usePlayer();
  const { setMood } = useTheme();
  const { setMiniPlayerVisible } = useLayoutVars();
  const routeTick = useRouteTick();
  const route = currentRoute();
  void routeTick;
  const hidden = !currentTrack || route.includes("now-playing");

  useEffect(() => {
    setMiniPlayerVisible(!hidden);
  }, [hidden, setMiniPlayerVisible]);

  useEffect(() => {
    if (!currentTrack?.coverUrl) return;
    extractCoverAccent(currentTrack.coverUrl).then((accent) => {
      if (accent) setMood({ coverAccent: accent });
    });
  }, [currentTrack?.id, currentTrack?.coverUrl, setMood]);

  if (hidden || !currentTrack) return null;

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const accent = moodAccent(currentTrack.moods);

  return (
    <View className={`mini-player ${isPlaying ? "mini-player--playing" : ""}`} style={{ "--player-accent": accent } as Record<string, string>}>
      <View className="mini-player__progress">
        <View className="mini-player__progress-fill" style={{ width: `${progressPct}%` }} />
      </View>
      <View className="mini-player__main" onClick={() => Taro.navigateTo({ url: STACK_PAGE_ROUTES.nowPlaying })}>
        {currentTrack.coverUrl ? (
          <Image className={clsx("mini-player__cover", isPlaying && "mini-player__cover--spin")} src={currentTrack.coverUrl} mode="aspectFill" />
        ) : (
          <View className="mini-player__cover mini-player__cover--fallback" />
        )}
        <View className="mini-player__info">
          <Text className={`mini-player__title ${isPlaying ? "mini-player__title--active" : ""}`}>{currentTrack.title}</Text>
          {currentTrack.artist && <Text className="mini-player__artist">{currentTrack.artist}</Text>}
        </View>
      </View>
      <View
        className="mini-player__btn"
        onClick={(e) => {
          e.stopPropagation();
          togglePlay();
        }}
      >
        <Icon name={isPlaying ? "pause" : "play"} accent size="lg" />
      </View>
    </View>
  );
}
