import { useEffect, useMemo, useState } from "react";
import { View, Text, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { PageShell } from "../../../components/PageShell";
import { LoadingSkeleton, SegmentedControl, EmptyState, Button } from "../../../components/ui";
import { socialPage } from "../../../constants/routes";
import { vibeApi } from "../../../services/api";
import "./index.scss";

type DuelRow = {
  id: string;
  status: string;
  challenger?: string;
  opponent?: string;
  challenger_votes?: number;
  opponent_votes?: number;
  vote_ends_at?: string;
  winner?: string;
  challenger_work?: { title?: string; cover_url?: string };
  opponent_work?: { title?: string; cover_url?: string };
};

const STATUS_FILTERS = ["all", "voting", "open", "settled"] as const;

function statusBadgeLabel(row: DuelRow, s: ReturnType<typeof useLocale>["copy"]["socialUi"]): string {
  if (row.status === "settled" && row.winner) return s.duelWinner.replace("{user}", row.winner);
  if (row.status === "draw") return s.duelDraw;
  if (row.status === "voting" && row.vote_ends_at) {
    const left = Math.max(0, Math.round((new Date(row.vote_ends_at).getTime() - Date.now()) / 3600000));
    return s.duelEndsIn.replace("{h}", String(left));
  }
  const statusMap: Record<string, string> = {
    open: s.duelStatusOpen,
    voting: s.duelStatusVoting,
    settled: s.duelStatusSettled,
    draw: s.duelStatusDraw,
    accepted: s.duelStatusAccepted,
  };
  return statusMap[row.status] || row.status;
}

function ctaLabel(row: DuelRow, s: ReturnType<typeof useLocale>["copy"]["socialUi"]): string {
  if (row.status === "voting") return s.duelVoteNow;
  if (row.status === "open") return s.duelAccept;
  return s.duelViewDetail;
}

export default function DuelsListPage() {
  const { copy } = useLocale();
  const s = copy.socialUi;
  const [duels, setDuels] = useState<DuelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("all");
  const hideHeader = process.env.TARO_ENV === "weapp";

  function loadDuels() {
    setLoading(true);
    setError(false);
    vibeApi
      .listDuels(status === "all" ? undefined : status)
      .then((res) => setDuels((res.duels || []) as DuelRow[]))
      .catch(() => {
        setDuels([]);
        setError(true);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadDuels();
  }, [status]);

  const statusLabels = useMemo(
    () => ({
      all: s.duelsFilterAll,
      voting: s.duelsFilterVoting,
      open: s.duelsFilterOpen,
      settled: s.duelsFilterSettled,
    }),
    [s]
  );

  useEffect(() => {
    Taro.setNavigationBarTitle({ title: s.duelsTitle });
  }, [s.duelsTitle]);

  return (
    <PageShell title={s.duelsTitle} hideHeader={hideHeader}>
      <View className="duels-page">
        <SegmentedControl
          className="duels-page__tabs"
          value={status}
          options={STATUS_FILTERS.map((v) => ({ value: v, label: statusLabels[v] }))}
          onChange={(v) => setStatus(v as (typeof STATUS_FILTERS)[number])}
        />
        {loading && <LoadingSkeleton count={3} />}
        {!loading && error && (
          <EmptyState
            iconName="remix"
            title={s.duelsLoadFail}
            actionLabel={copy.discoverUi.retry}
            onAction={loadDuels}
          />
        )}
        {!loading && !error && duels.length === 0 && (
          <EmptyState iconName="remix" title={s.duelsEmpty} description={s.duelsEmptyHint} />
        )}
        {!loading &&
          !error &&
          duels.map((d) => (
            <View key={d.id} className="duels-page__card">
              <View className="duels-page__arena">
                <View className="duels-page__fighter">
                  {d.challenger_work?.cover_url ? (
                    <Image className="duels-page__cover" src={d.challenger_work.cover_url} mode="aspectFill" />
                  ) : (
                    <View className="duels-page__cover duels-page__cover--fallback">
                      <Text className="duels-page__side-label">A</Text>
                    </View>
                  )}
                  <Text className="duels-page__user" numberOfLines={1}>
                    @{d.challenger}
                  </Text>
                  <Text className="duels-page__work-title" numberOfLines={2}>
                    {d.challenger_work?.title || "—"}
                  </Text>
                </View>
                <View className="duels-page__vs-col">
                  <Text className="duels-page__badge">{statusBadgeLabel(d, s)}</Text>
                  <Text className="duels-page__vs">VS</Text>
                  <Text className="duels-page__score">
                    {d.challenger_votes ?? 0} : {d.opponent_votes ?? 0}
                  </Text>
                </View>
                <View className="duels-page__fighter">
                  {d.opponent_work?.cover_url ? (
                    <Image className="duels-page__cover" src={d.opponent_work.cover_url} mode="aspectFill" />
                  ) : (
                    <View className="duels-page__cover duels-page__cover--fallback">
                      <Text className="duels-page__side-label">B</Text>
                    </View>
                  )}
                  <Text className="duels-page__user" numberOfLines={1}>
                    {d.opponent ? `@${d.opponent}` : s.duelOpen}
                  </Text>
                  <Text className="duels-page__work-title" numberOfLines={2}>
                    {d.opponent_work?.title || "—"}
                  </Text>
                </View>
              </View>
              <Button
                variant={d.status === "voting" ? "primary" : "secondary"}
                block
                size="sm"
                onClick={() => Taro.navigateTo({ url: socialPage("duel", { id: d.id }) })}
              >
                {ctaLabel(d, s)}
              </Button>
            </View>
          ))}
      </View>
    </PageShell>
  );
}
