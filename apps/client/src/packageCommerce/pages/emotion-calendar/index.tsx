import { useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { workToPlayerTrack } from "@vibe-sorcery/types";
import { PageShell, SectionLabel } from "../../../components/PageShell";
import { Button, EmptyState, LoadingSkeleton, RingGauge } from "../../../components/ui";
import { usePlayer } from "../../../contexts/PlayerProvider";
import { stackPage } from "../../../constants/routes";
import { vibeApi } from "../../../services/api";
import { bootstrapAuth, requireAuth } from "../../../utils/auth";
import "./index.scss";

type Entry = {
  id: string;
  entry_date: string;
  arousal?: number;
  valence?: number;
  work_id?: string;
  mood_tags?: string[];
};

export default function EmotionCalendarPage() {
  const { copy } = useLocale();
  const cal = copy.emotionCalendarUi;
  const { playTrack } = usePlayer();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [album, setAlbum] = useState<Awaited<ReturnType<typeof vibeApi.getMonthlyEmotionAlbum>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);

  useDidShow(() => {
    if (!requireAuth()) return;
    bootstrapAuth();
    setLoading(true);
    Promise.all([vibeApi.getEmotionCalendar(), vibeApi.getMonthlyEmotionAlbum()])
      .then(([res, alb]) => {
        setEntries(res.entries);
        setAlbum(alb);
      })
      .catch(() => Taro.showToast({ title: cal.loadFail, icon: "none" }))
      .finally(() => setLoading(false));
  });

  async function playAlbum() {
    if (!album?.track_count || playing) return;
    if (album.playlist_id) {
      Taro.navigateTo({ url: `/pages/playlist/index?id=${album.playlist_id}` });
      return;
    }
    if (!album.work_ids?.length) return;
    setPlaying(true);
    try {
      const works = await Promise.all(album.work_ids.map((id) => vibeApi.getWork(id)));
      const tracks = works.filter((w) => w.audio_url).map((w) => workToPlayerTrack(w, { source: "emotion-calendar" }));
      if (!tracks.length) {
        Taro.showToast({ title: cal.playFail, icon: "none" });
        return;
      }
      playTrack(tracks[0], { queue: tracks, navigate: true });
    } catch {
      Taro.showToast({ title: cal.playFail, icon: "none" });
    } finally {
      setPlaying(false);
    }
  }

  const byDate = entries.reduce<Record<string, Entry[]>>((acc, e) => {
    (acc[e.entry_date] ||= []).push(e);
    return acc;
  }, {});

  return (
    <PageShell title={cal.title} subtitle={cal.subtitle} wide ambient>
      {loading && <LoadingSkeleton count={4} />}
      {!loading && album && (
        <View className="emotion-cal__album">
          <Text className="emotion-cal__album-title">{album.title}</Text>
          <View className="emotion-cal__album-stats">
            <RingGauge value={Math.round((album.avg_valence || 3) * 20)} max={100} label={cal.avgMood} />
            <RingGauge value={Math.round((album.avg_arousal || 3) * 20)} max={100} label={cal.avgEnergy} />
          </View>
          <Text className="typo-meta">{cal.trackCount.replace("{n}", String(album.track_count))}</Text>
          {album.track_count > 0 && (
            <Button variant="secondary" size="sm" loading={playing} onClick={() => void playAlbum()}>
              {cal.playAlbum}
            </Button>
          )}
          {album.track_count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const text = `${album.title} · ${cal.trackCount.replace("{n}", String(album.track_count))} · A${Math.round((album.avg_arousal || 3) * 10) / 10} V${Math.round((album.avg_valence || 3) * 10) / 10}`;
                Taro.setClipboardData({ data: text });
                Taro.showToast({ title: cal.shareAlbumCopied, icon: "success" });
              }}
            >
              {cal.shareAlbum}
            </Button>
          )}
        </View>
      )}

      <SectionLabel>{cal.recentLabel}</SectionLabel>
      {!loading && entries.length === 0 && <EmptyState iconName="journey" title={cal.empty} description={cal.emptyDesc} />}
      {Object.keys(byDate)
        .sort((a, b) => b.localeCompare(a))
        .map((day) => (
          <View key={day} className="emotion-cal__day">
            <Text className="emotion-cal__day-label">{day}</Text>
            {byDate[day].map((e) => (
              <View key={e.id} className="emotion-cal__entry" onClick={() => e.work_id && Taro.navigateTo({ url: stackPage("work", { workId: e.work_id }) })}>
                <Text className="emotion-cal__entry-moods">{e.mood_tags?.join(" · ") || cal.noMoods}</Text>
                <Text className="typo-meta">A{e.arousal ?? "—"} V{e.valence ?? "—"}</Text>
              </View>
            ))}
          </View>
        ))}
    </PageShell>
  );
}
