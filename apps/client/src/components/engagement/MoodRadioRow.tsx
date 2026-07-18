import { useEffect, useState } from "react";
import { View, Text, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { workToPlayerTrack } from "@vibe-sorcery/types";
import { vibeApi } from "../../services/api";
import { usePlayerTransport } from "../../contexts/PlayerProvider";
import { Icon, LoadingSkeleton } from "../ui";
import "./MoodRadioRow.scss";

type Track = {
  work_id: string;
  post_id: string;
  title: string;
  author: string;
  cover_url?: string;
  audio_url?: string;
};

function displayTitle(title: string | undefined, fallback: string): string {
  const t = title?.trim();
  if (!t || t.length <= 1) return fallback;
  return t;
}

export function MoodRadioRow() {
  const { copy } = useLocale();
  const e = copy.engagementUi;
  const { playTrack } = usePlayerTransport();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    vibeApi
      .getMoodRadio(3)
      .then((res) => setTracks(res.tracks || []))
      .catch(() => setTracks([]))
      .finally(() => setLoading(false));
    vibeApi.trackEvent("radio_daily_open").catch(() => {});
  }, []);

  if (loading) {
    return (
      <View className="mood-radio">
        <LoadingSkeleton count={2} variant="line" />
      </View>
    );
  }

  if (!tracks.length) {
    return (
      <View className="mood-radio mood-radio--empty">
        <View className="mood-radio__head">
          <Icon name="music" size="sm" accent />
          <Text className="mood-radio__title">{e.radioTitle}</Text>
        </View>
        <Text className="mood-radio__empty">{e.radioEmpty}</Text>
      </View>
    );
  }

  function play(t: Track, index: number) {
    if (!t.audio_url) {
      Taro.showToast({ title: e.radioNoAudio, icon: "none" });
      return;
    }
    const track = workToPlayerTrack({
      id: t.work_id,
      title: displayTitle(t.title, e.radioUntitled.replace("{n}", String(index + 1))),
      audio_url: t.audio_url,
      cover_url: t.cover_url,
      moods: [],
      source: "feed",
    });
    playTrack(track, { navigate: false });
    Taro.showToast({ title: e.radioPlaying, icon: "none" });
  }

  return (
    <View className="mood-radio">
      <View className="mood-radio__head">
        <Icon name="music" size="sm" accent />
        <Text className="mood-radio__title">{e.radioTitle}</Text>
      </View>
      <View className="mood-radio__list">
        {tracks.map((t, i) => {
          const title = displayTitle(t.title, e.radioUntitled.replace("{n}", String(i + 1)));
          return (
            <View key={t.work_id} className="mood-radio__item" onClick={() => play(t, i)}>
              {t.cover_url ? (
                <Image className="mood-radio__cover" src={t.cover_url} mode="aspectFill" />
              ) : (
                <View className="mood-radio__cover mood-radio__cover--fallback">
                  <Icon name="music" size="sm" accent />
                </View>
              )}
              <View className="mood-radio__meta">
                <Text className="mood-radio__name" numberOfLines={1}>
                  {title}
                </Text>
                <Text className="mood-radio__author" numberOfLines={1}>
                  @{t.author || "?"}
                </Text>
              </View>
              <View className="mood-radio__play">
                <Icon name="play" size="sm" accent />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
