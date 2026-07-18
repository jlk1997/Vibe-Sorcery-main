import { useEffect, useMemo, useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { workToPlayerTrack } from "@vibe-sorcery/types";
import { PageShell } from "../../../components/PageShell";
import { LeaderboardEntry } from "../../../components/community/LeaderboardEntry";
import { SegmentedControl, LoadingSkeleton, EmptyState } from "../../../components/ui";
import { STACK_PAGE_ROUTES } from "../../../constants/routes";
import { vibeApi } from "../../../services/api";
import "./index.scss";

const CHARTS = ["heat", "rising", "remix", "resonance"] as const;
const PERIODS = ["week", "day", "last_week"] as const;

type ChartEntry = {
  rank: number;
  work_id: string;
  post_id?: string;
  title: string;
  author: string;
  cover_url?: string;
  audio_url?: string;
  hls_url?: string;
  like_count?: number;
};

export default function ChartsPage() {
  const { copy } = useLocale();
  const s = copy.socialUi;
  const d = copy.discoverUi;
  const [chart, setChart] = useState<(typeof CHARTS)[number]>("heat");
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("week");
  const [entries, setEntries] = useState<ChartEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  function loadChart() {
    setLoading(true);
    setError(false);
    const req =
      period === "last_week"
        ? vibeApi.getChartHistory(chart)
        : vibeApi.getChart(chart, period);
    req
      .then((res) => setEntries((res.entries || []) as ChartEntry[]))
      .catch(() => {
        setEntries([]);
        setError(true);
        Taro.showToast({ title: s.chartsLoadFail, icon: "none" });
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadChart();
  }, [chart, period]);

  useEffect(() => {
    Taro.setNavigationBarTitle({ title: s.chartsTitle });
  }, [s.chartsTitle]);

  const labels: Record<string, string> = {
    heat: s.chartHeat,
    rising: s.chartRising,
    remix: s.chartRemix,
    resonance: s.chartResonance,
  };

  const tracks = useMemo(
    () =>
      entries
        .filter((e) => e.work_id)
        .map((e) =>
          workToPlayerTrack(
            {
              id: e.work_id,
              title: e.title,
              audio_url: e.audio_url || "",
              hls_url: e.hls_url,
              moods: [],
              cover_url: e.cover_url,
            },
            { artist: e.author, source: "charts" }
          )
        ),
    [entries]
  );

  function openWork(workId: string) {
    Taro.navigateTo({ url: `${STACK_PAGE_ROUTES.work}?workId=${workId}` });
  }

  return (
    <PageShell title={s.chartsTitle} showBack>
      <View className="charts-page">
        <SegmentedControl
          value={chart}
          options={CHARTS.map((c) => ({ value: c, label: labels[c] }))}
          onChange={(v) => setChart(v as (typeof CHARTS)[number])}
        />
        <SegmentedControl
          value={period}
          options={[
            { value: "week", label: s.chartPeriodWeek },
            { value: "day", label: s.chartPeriodDay },
            { value: "last_week", label: s.chartPeriodLastWeek },
          ]}
          onChange={(v) => setPeriod(v as (typeof PERIODS)[number])}
        />
        {loading && <LoadingSkeleton rows={6} />}
        {!loading && error && (
          <EmptyState iconName="feed" title={s.chartsLoadFail} actionLabel={d.retry} onAction={loadChart} />
        )}
        {!loading && !error && entries.length === 0 && (
          <EmptyState iconName="feed" title={s.chartsEmpty} />
        )}
        {!loading &&
          !error &&
          entries.map((row, idx) => {
            const track = tracks[idx];
            if (!track?.audio_url) return null;
            return (
              <LeaderboardEntry
                key={String(row.work_id)}
                rank={Number(row.rank) || idx + 1}
                title={String(row.title || "")}
                author={String(row.author || "")}
                coverUrl={row.cover_url}
                likeCount={row.like_count}
                likesLabel={d.likes}
                track={track}
                queue={tracks}
                onClick={() => openWork(String(row.work_id))}
              />
            );
          })}
      </View>
    </PageShell>
  );
}
