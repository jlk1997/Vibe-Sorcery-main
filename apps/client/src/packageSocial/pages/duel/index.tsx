import { useEffect, useMemo, useState } from "react";
import { View, Text, Image } from "@tarojs/components";
import Taro, { useRouter, useShareAppMessage } from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { workToPlayerTrack } from "@vibe-sorcery/types";
import { PageShell } from "../../../components/PageShell";
import { BottomSheet, Button, LoadingSkeleton, ProgressRail } from "../../../components/ui";
import { usePlayerTransport, usePlayerProgress } from "../../../contexts/PlayerProvider";
import { vibeApi } from "../../../services/api";
import { requireAuth } from "../../../utils/auth";
import { sharePage } from "../../../platform/share";
import "./index.scss";

type DuelWork = {
  id: string;
  title: string;
  cover_url?: string;
  audio_url?: string;
  hls_url?: string;
};

type DuelDetail = {
  id: string;
  status: string;
  challenger?: string;
  opponent?: string;
  challenger_work?: DuelWork;
  opponent_work?: DuelWork;
  challenger_votes?: number;
  opponent_votes?: number;
  vote_ends_at?: string;
  can_accept?: boolean;
  winner?: string;
  winner_id?: string;
};

const EMOTION_KEYS = ["calm", "joy", "melancholy", "energy"] as const;

function statusLabel(duel: DuelDetail, s: ReturnType<typeof useLocale>["copy"]["socialUi"]): string {
  if (duel.status === "settled" && duel.winner) return s.duelWinner.replace("{user}", duel.winner);
  if (duel.status === "draw") return s.duelDraw;
  const map: Record<string, string> = {
    open: s.duelStatusOpen,
    voting: s.duelStatusVoting,
    settled: s.duelStatusSettled,
    draw: s.duelStatusDraw,
    accepted: s.duelStatusAccepted,
  };
  return map[duel.status] || duel.status;
}

export default function DuelDetailPage() {
  const { copy } = useLocale();
  const s = copy.socialUi;
  const router = useRouter();
  const duelId = router.params.id || "";
  const isWeapp = process.env.TARO_ENV === "weapp";

  useShareAppMessage(() => ({
    title: s.duelShareTitle,
    path: `/packageSocial/pages/duel/index?id=${duelId}`,
  }));

  const { playTrack, currentTrackId } = usePlayerTransport();
  const { currentTime, duration } = usePlayerProgress();
  const [duel, setDuel] = useState<DuelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [listenSide, setListenSide] = useState<"a" | "b" | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [works, setWorks] = useState<Array<{ id: string; title: string }>>([]);
  const [accepting, setAccepting] = useState(false);
  const [myUsername, setMyUsername] = useState<string | null>(null);
  const [emotionTag, setEmotionTag] = useState<string | null>(null);
  const e = copy.engagementUi;
  const hideHeader = process.env.TARO_ENV === "weapp";

  const listenRatio = useMemo(() => {
    if (!duration || duration <= 0) return 0;
    return currentTime / duration;
  }, [currentTime, duration]);

  const activeListenRatio = listenSide ? listenRatio : 0;
  const canVote = activeListenRatio >= 0.5;

  function voteButtonLabel(side: "a" | "b") {
    if (listenSide !== side || activeListenRatio < 0.5) return s.duelVoteNeedListen;
    return side === "a" ? s.voteA : s.voteB;
  }

  useEffect(() => {
    if (!duelId) return;
    vibeApi
      .getDuel(duelId)
      .then((res) => setDuel(res as DuelDetail))
      .catch(() => setDuel(null))
      .finally(() => setLoading(false));
    vibeApi.me().then((me) => setMyUsername(me.username)).catch(() => {});
  }, [duelId]);

  useEffect(() => {
    Taro.setNavigationBarTitle({ title: s.duelDetailTitle });
  }, [s.duelDetailTitle]);

  function playSide(side: "a" | "b") {
    const work = side === "a" ? duel?.challenger_work : duel?.opponent_work;
    if (!work?.audio_url) {
      Taro.showToast({ title: s.duelNoAudio, icon: "none" });
      return;
    }
    setListenSide(side);
    const track = workToPlayerTrack(
      { id: work.id, title: work.title, audio_url: work.audio_url, hls_url: work.hls_url, moods: [] },
      { source: "duel" }
    );
    playTrack(track, { navigate: false });
  }

  async function vote(side: "a" | "b") {
    if (!requireAuth() || !duelId) return;
    const ratio = listenSide === side ? listenRatio : 0;
    if (ratio < 0.5) {
      Taro.showToast({ title: s.duelListenFirst, icon: "none" });
      return;
    }
    try {
      await vibeApi.voteDuel(duelId, side, ratio, emotionTag || undefined);
      Taro.showToast({ title: s.duelVoted, icon: "success" });
      const res = await vibeApi.getDuel(duelId);
      setDuel(res as DuelDetail);
    } catch {
      Taro.showToast({ title: s.duelVoteFail, icon: "none" });
    }
  }

  async function openAcceptPicker() {
    if (!requireAuth()) return;
    const list = await vibeApi.listWorks();
    const published = list.filter((w) => w.visibility === "public");
    if (!published.length) {
      Taro.showToast({ title: s.duelNeedPublish, icon: "none" });
      return;
    }
    setWorks(published.map((w) => ({ id: w.id, title: w.title })));
    setPickerOpen(true);
  }

  async function acceptWith(workId: string) {
    setAccepting(true);
    try {
      await vibeApi.acceptDuel(duelId, workId);
      Taro.showToast({ title: s.duelAccepted, icon: "success" });
      setPickerOpen(false);
      const res = await vibeApi.getDuel(duelId);
      setDuel(res as DuelDetail);
    } catch {
      Taro.showToast({ title: s.duelAcceptFail, icon: "none" });
    } finally {
      setAccepting(false);
    }
  }

  const emotionLabels: Record<(typeof EMOTION_KEYS)[number], string> = {
    calm: e.moodCalm,
    joy: e.moodJoy,
    melancholy: e.moodMelancholy,
    energy: e.moodEnergy,
  };

  const canAccept =
    duel?.can_accept &&
    duel.status !== "voting" &&
    myUsername &&
    duel.challenger !== myUsername &&
    (!duel.opponent || duel.opponent === myUsername);

  if (loading) {
    return (
      <PageShell title={s.duelDetailTitle} hideHeader={hideHeader}>
        <LoadingSkeleton count={4} />
      </PageShell>
    );
  }

  if (!duel) {
    return (
      <PageShell title={s.duelDetailTitle} hideHeader={hideHeader}>
        <Text className="duel-detail__empty">{s.duelsEmpty}</Text>
      </PageShell>
    );
  }

  const badge = statusLabel(duel, s);
  const isSettled = duel.status === "settled" || duel.status === "draw";

  return (
    <PageShell title={s.duelDetailTitle} hideHeader={hideHeader}>
      <View className="duel-detail">
        <View className="duel-detail__hero">
          <Text className="duel-detail__badge">{badge}</Text>
          <View className="duel-detail__arena">
            <View className="duel-detail__side">
              {duel.challenger_work?.cover_url ? (
                <Image className="duel-detail__cover" src={duel.challenger_work.cover_url} mode="aspectFill" />
              ) : (
                <View className="duel-detail__cover duel-detail__cover--fallback">
                  <Text className="duel-detail__side-tag">A</Text>
                </View>
              )}
              <Text className="duel-detail__user">@{duel.challenger}</Text>
              <Text className="duel-detail__work-title" numberOfLines={2}>
                {duel.challenger_work?.title || "—"}
              </Text>
            </View>
            <View className="duel-detail__mid">
              <Text className="duel-detail__vs">VS</Text>
              <Text className="duel-detail__score">
                {duel.challenger_votes ?? 0} : {duel.opponent_votes ?? 0}
              </Text>
              <Text className="duel-detail__score-label">{s.duelVotes}</Text>
            </View>
            <View className="duel-detail__side">
              {duel.opponent_work?.cover_url ? (
                <Image className="duel-detail__cover" src={duel.opponent_work.cover_url} mode="aspectFill" />
              ) : (
                <View className="duel-detail__cover duel-detail__cover--fallback">
                  <Text className="duel-detail__side-tag">B</Text>
                </View>
              )}
              <Text className="duel-detail__user">{duel.opponent ? `@${duel.opponent}` : s.duelOpen}</Text>
              <Text className="duel-detail__work-title" numberOfLines={2}>
                {duel.opponent_work?.title || "—"}
              </Text>
            </View>
          </View>
        </View>

        {!isSettled && (
          <View className="duel-detail__listen-panel">
            <Text className="duel-detail__section-title">{s.duelListenSection}</Text>
            <View className="duel-detail__tracks">
              <Button
                block
                variant={listenSide === "a" && currentTrackId === duel.challenger_work?.id ? "primary" : "secondary"}
                onClick={() => playSide("a")}
              >
                {s.duelPlayA.replace("{title}", duel.challenger_work?.title || "—")}
              </Button>
              <Button
                block
                variant={listenSide === "b" && currentTrackId === duel.opponent_work?.id ? "primary" : "secondary"}
                onClick={() => playSide("b")}
              >
                {s.duelPlayB.replace("{title}", duel.opponent_work?.title || "—")}
              </Button>
            </View>
            {listenSide && (
              <View className="duel-detail__listen-block">
                <Text className="duel-detail__listen">
                  {s.duelListenProgress.replace("{n}", String(Math.round(activeListenRatio * 100)))}
                </Text>
                <ProgressRail pct={activeListenRatio * 100} className="duel-detail__listen-rail" />
                {!canVote && <Text className="duel-detail__listen-hint">{s.duelVoteNeedListen}</Text>}
              </View>
            )}
          </View>
        )}

        {isSettled && (
          <View className="duel-detail__result">
            <Text className="duel-detail__result-label">{s.duelResultTitle}</Text>
            <Text className="duel-detail__winner">
              {duel.status === "draw" ? s.duelDraw : s.duelWinner.replace("{user}", duel.winner || "—")}
            </Text>
          </View>
        )}

        {canAccept && (
          <Button variant="primary" block onClick={() => void openAcceptPicker()}>
            {s.duelAccept}
          </Button>
        )}

        {duel.status === "voting" && (
          <View className="duel-detail__vote-panel">
            <Text className="duel-detail__section-title">{s.duelPickEmotion}</Text>
            <View className="duel-detail__emotions">
              {EMOTION_KEYS.map((key) => (
                <Button
                  key={key}
                  size="sm"
                  variant={emotionTag === key ? "primary" : "secondary"}
                  onClick={() => setEmotionTag(key)}
                >
                  {emotionLabels[key]}
                </Button>
              ))}
            </View>
            <View className="duel-detail__actions">
              <Button block variant={canVote && listenSide === "a" ? "primary" : "secondary"} onClick={() => vote("a")}>
                {voteButtonLabel("a")}
              </Button>
              <Button block variant={canVote && listenSide === "b" ? "primary" : "secondary"} onClick={() => vote("b")}>
                {voteButtonLabel("b")}
              </Button>
            </View>
          </View>
        )}

        <Button
          variant="ghost"
          block
          openType={isWeapp ? "share" : undefined}
          onClick={() => sharePage(s.duelShareTitle, `/packageSocial/pages/duel/index?id=${duelId}`)}
        >
          {s.duelShare}
        </Button>
      </View>

      <BottomSheet open={pickerOpen} title={s.duelPickWork} onClose={() => setPickerOpen(false)}>
        {works.map((w) => (
          <View key={w.id} className="duel-detail__pick" onClick={() => !accepting && acceptWith(w.id)}>
            <Text>{w.title}</Text>
          </View>
        ))}
      </BottomSheet>
    </PageShell>
  );
}
