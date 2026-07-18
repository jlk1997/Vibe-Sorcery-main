import { useEffect, useState } from "react";
import { View, Text, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { STACK_PAGE_ROUTES } from "../../constants/routes";
import { moodAccent } from "@vibe-sorcery/types";
import { usePlayer } from "../../contexts/PlayerProvider";
import { extractCoverAccent, useTheme } from "../../contexts/ThemeProvider";
import { currentLayoutRoute } from "../../constants/routes";
import { useLayoutVars } from "../../contexts/LayoutVarsProvider";
import { useRouteTick } from "../../hooks/useRouteTick";
import { NOW_PLAYING_EVENTS } from "../../constants/events";
import { Icon } from "../ui";
import { clsx } from "../../utils/clsx";
import "./MiniPlayerBar.scss";

const isWeapp = process.env.TARO_ENV === "weapp";

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

  // 迷你条是否处于「正在播放全屏页」而需要隐藏。
  // weapp 上 useRouteTick 依赖的路由事件不稳定，改由 now-playing 页面的
  // useDidShow / useDidHide 主动广播进入/离开信号，保证退出全屏后能重新出现。
  const [onNowPlaying, setOnNowPlaying] = useState<boolean>(() =>
    currentRoute().includes("now-playing"),
  );

  useEffect(() => {
    const enter = () => setOnNowPlaying(true);
    const leave = () => setOnNowPlaying(false);
    Taro.eventCenter.on(NOW_PLAYING_EVENTS.enter, enter);
    Taro.eventCenter.on(NOW_PLAYING_EVENTS.leave, leave);
    return () => {
      Taro.eventCenter.off(NOW_PLAYING_EVENTS.enter, enter);
      Taro.eventCenter.off(NOW_PLAYING_EVENTS.leave, leave);
    };
  }, []);

  // weapp 以广播信号为准；H5 路由事件可靠，沿用路由判断。
  const hidden = !currentTrack || (isWeapp ? onNowPlaying : route.includes("now-playing"));

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
