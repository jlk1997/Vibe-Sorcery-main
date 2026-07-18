import { useMemo, useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro, { useRouter, useDidShow } from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { workToPlayerTrack } from "@vibe-sorcery/types";
import { PageShell, SectionLabel } from "../../../components/PageShell";
import { LeaderboardEntry } from "../../../components/community/LeaderboardEntry";
import { BottomSheet, Button, EmptyState, ImmersiveCover, LoadingSkeleton, StatPill } from "../../../components/ui";
import { vibeApi } from "../../../services/api";
import { bootstrapAuth, requireAuth } from "../../../utils/auth";
import { useCreditsOptional } from "../../../contexts/CreditsProvider";
import { setItem } from "../../../platform/storage";
import "./index.scss";

type ChallengeData = Awaited<ReturnType<typeof vibeApi.getChallenge>>;
type Entry = ChallengeData["entries"][number];

export default function ChallengeDetailPage() {
  const router = useRouter();
  const { copy } = useLocale();
  const cd = copy.challengeDetail;
  const slug = router.params.slug || "";
  const [challenge, setChallenge] = useState<ChallengeData | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [works, setWorks] = useState<Array<{ id: string; title: string }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const creditsCtx = useCreditsOptional();

  async function reload() {
    if (!slug) return;
    const [data, board] = await Promise.all([
      vibeApi.getChallenge(slug),
      vibeApi.getChallengeLeaderboard(slug).catch(() => null),
    ]);
    setChallenge(data);
    if (board?.entries?.length) {
      setEntries(
        board.entries.map((e) => ({
          work_id: e.work_id,
          title: e.title,
          author: e.author,
          like_count: e.like_count,
          cover_url: e.cover_url,
          moods: [],
          audio_url: data.entries?.find((x) => x.work_id === e.work_id)?.audio_url,
          hls_url: data.entries?.find((x) => x.work_id === e.work_id)?.hls_url,
        }))
      );
    } else {
      setEntries(data.entries || []);
    }
  }

  useDidShow(async () => {
    if (!slug) return;
    bootstrapAuth();
    setLoading(true);
    try {
      await reload();
    } catch {
      Taro.showToast({ title: cd.loadFail, icon: "none" });
    } finally {
      setLoading(false);
    }
  });

  const playQueue = useMemo(
    () =>
      entries
        .filter((e) => e.audio_url)
        .map((e) =>
          workToPlayerTrack(
            { id: e.work_id, title: e.title, audio_url: e.audio_url!, hls_url: e.hls_url, moods: e.moods },
            { artist: e.author, source: "challenge" }
          )
        ),
    [entries]
  );

  async function openWorkPicker() {
    if (!requireAuth()) return;
    try {
      const list = await vibeApi.listWorks();
      if (!list.length) {
        Taro.showModal({
          title: cd.noWorksTitle,
          content: cd.noWorksContent,
          success: (r) => {
            if (r.confirm) goCreateOfficial();
          },
        });
        return;
      }
      setWorks(list.map((w) => ({ id: w.id, title: w.title })));
      setPickerOpen(true);
    } catch {
      Taro.showToast({ title: cd.loadWorksFail, icon: "none" });
    }
  }

  async function submitWork(workId: string) {
    if (!challenge) return;
    setSubmitting(true);
    try {
      const res = await vibeApi.enterChallenge(slug, workId, `#${challenge.hashtag || challenge.title}`);
      Taro.showToast({ title: cd.submitSuccess, icon: "success" });
      const reward = res.task_reward;
      if (reward?.credits_granted && !reward.duplicate) {
        if (reward.balance != null) creditsCtx?.setBalance(reward.balance);
        else void creditsCtx?.refresh();
        setTimeout(() => {
          Taro.showToast({
            title: cd.taskReward.replace("{n}", String(reward.credits_granted)),
            icon: "success",
          });
        }, 600);
      }
      setPickerOpen(false);
      await reload();
    } catch {
      Taro.showToast({ title: cd.submitFail, icon: "none" });
    } finally {
      setSubmitting(false);
    }
  }

  function goCreateOfficial() {
    if (!challenge) return;
    setItem("create:challengeSlug", slug);
    setItem("create:seedIntent", challenge.description || `#${challenge.hashtag} ${challenge.title}`);
    Taro.switchTab({ url: "/pages/create/index" });
  }

  const title = challenge?.title || cd.pageTitleFallback;
  const hashtag = challenge?.hashtag || "";

  return (
    <PageShell label={copy.navGroups.community} title={title} subtitle={hashtag} wide immersive noPadTop ambient>
      <ImmersiveCover coverUrl={challenge?.cover_url} height="320rpx">
        {challenge?.description && <Text className="challenge-hero__desc">{challenge.description}</Text>}
        <View className="challenge-hero__stats">
          {challenge?.participant_count != null && (
            <StatPill label={copy.challengesUi.participants.replace("{n}", String(challenge.participant_count))} />
          )}
          {challenge?.ends_at && (
            <StatPill label={`${cd.deadlinePrefix}${challenge.ends_at.slice(0, 10)}`} variant="muted" />
          )}
          {challenge?.prize_pool_credits ? (
            <StatPill label={cd.prizePool.replace("{n}", String(challenge.prize_pool_credits))} variant="accent" />
          ) : null}
          {challenge?.sponsor_label ? (
            <StatPill label={cd.sponsor.replace("{name}", challenge.sponsor_label)} variant="muted" />
          ) : null}
          {challenge?.awards_distributed ? <StatPill label={cd.awardsDone} variant="muted" /> : null}
        </View>
      </ImmersiveCover>

      <SectionLabel>{cd.leaderboard}</SectionLabel>
      {loading && <LoadingSkeleton count={4} variant="line" />}
      {!loading && entries.length === 0 && <EmptyState iconName="flag" title={cd.emptyEntriesShort} />}
      {entries.map((e, i) => (
        <LeaderboardEntry
          key={e.work_id}
          rank={i + 1}
          title={e.title}
          author={e.author}
          coverUrl={e.cover_url}
          likeCount={e.like_count}
          likesLabel={cd.likes}
          track={
            e.audio_url
              ? workToPlayerTrack(
                  { id: e.work_id, title: e.title, audio_url: e.audio_url, hls_url: e.hls_url, moods: e.moods },
                  { artist: e.author, source: "challenge" }
                )
              : undefined
          }
          queue={playQueue}
          onClick={() => Taro.navigateTo({ url: `/pages/provenance/index?workId=${e.work_id}` })}
        />
      ))}

      <View className="challenge-actions">
        <Button variant="primary" block loading={submitting} onClick={openWorkPicker}>
          {cd.selectWorkSubmit}
        </Button>
        <Button variant="secondary" block onClick={goCreateOfficial}>
          {cd.createForChallenge}
        </Button>
      </View>

      <BottomSheet open={pickerOpen} title={cd.submitTitle} onClose={() => setPickerOpen(false)}>
        {works.length === 0 && <Text className="typo-meta">{cd.noWorks}</Text>}
        {works.map((w) => (
          <Button key={w.id} variant="ghost" block loading={submitting} onClick={() => submitWork(w.id)}>
            {w.title}
          </Button>
        ))}
      </BottomSheet>
    </PageShell>
  );
}
