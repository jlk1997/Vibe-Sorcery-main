import { useEffect, useRef, useState, useCallback } from "react";
import { View, Text } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { STACK_PAGE_ROUTES } from "../../constants/routes";
import { vibeApi } from "../../services/api";
import { useCreditsOptional } from "../../contexts/CreditsProvider";
import { clsx } from "../../utils/clsx";
import { Button, CreatorLevelBadge, Icon, LoadingSkeleton, SectionLabel, type IconName } from "../ui";
import "./EngagementPanel.scss";

type Progress = Awaited<ReturnType<typeof vibeApi.getProgress>>;
type Referral = Awaited<ReturnType<typeof vibeApi.getReferral>>;

const TASK_ICONS: Record<string, IconName> = {
  first_publish: "music",
  journey_feedback: "journey",
  first_remix: "remix",
  first_challenge: "feed",
};

const TASK_VARIANTS = ["accent", "info", "warning", "accent"] as const;

type Props = {
  /** When false, omit the section header (e.g. settings page provides its own label). */
  showHeader?: boolean;
  variant?: "full" | "compact";
};

const TASK_ROUTES: Record<string, string> = {
  first_publish: "/pages/create/index",
  journey_feedback: "/packageStudio/pages/journey/index",
  first_remix: "/pages/feed/index",
  first_challenge: STACK_PAGE_ROUTES.challenges,
};

const WEEKLY_TASK_ROUTES: Record<string, string> = {
  weekly_listen_3: "/pages/feed/index",
  weekly_remix_1: "/pages/feed/index",
  weekly_publish_1: "/pages/create/index",
  weekly_journey_1: "/packageStudio/pages/journey/index",
};

function resolveTaskRoute(taskKey: string): string | undefined {
  if (TASK_ROUTES[taskKey]) return TASK_ROUTES[taskKey];
  for (const [prefix, url] of Object.entries(WEEKLY_TASK_ROUTES)) {
    if (taskKey.startsWith(prefix)) return url;
  }
  return undefined;
}

export function EngagementPanel({ showHeader = true, variant = "full" }: Props) {
  const { copy } = useLocale();
  const p = copy.progressUi;
  const creditsCtx = useCreditsOptional();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [progressError, setProgressError] = useState(false);
  const [referral, setReferral] = useState<Referral | null>(null);
  const [wallet, setWallet] = useState<{
    balance_credits: number;
    lifetime_earned: number;
    recent_tips?: Array<{ amount: number }>;
    estimated_weekly_royalty?: number;
  } | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const eco = copy.ecosystemUi;
  const prevCompletedRef = useRef<Set<string>>(new Set());
  const tasksInitRef = useRef(false);

  const loadProgress = useCallback(() => {
    setProgressError(false);
    vibeApi
      .getProgress()
      .then(setProgress)
      .catch(() => setProgressError(true));
    vibeApi.getReferral().then(setReferral).catch(() => {});
    vibeApi.getCreatorWallet().then(setWallet).catch(() => {});
  }, []);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  useDidShow(() => {
    loadProgress();
    void creditsCtx?.refresh();
  });

  useEffect(() => {
    if (!progress) return;
    const completed = new Set(progress.tasks.filter((t) => t.completed).map((t) => t.key));
    if (!tasksInitRef.current) {
      prevCompletedRef.current = completed;
      tasksInitRef.current = true;
      return;
    }
    for (const task of progress.tasks) {
      if (task.completed && !prevCompletedRef.current.has(task.key)) {
        Taro.showToast({
          title: p.taskReward.replace("{n}", String(task.credits)),
          icon: "success",
        });
      }
    }
    prevCompletedRef.current = completed;
  }, [progress, p.taskReward]);

  async function checkin() {
    if (checkingIn || progress?.checked_in_today) return;
    setCheckingIn(true);
    try {
      const res = await vibeApi.dailyCheckin();
      creditsCtx?.setBalance(res.balance);
      Taro.showToast({ title: p.checkinSuccess, icon: "success" });
      setProgress(await vibeApi.getProgress());
    } catch {
      Taro.showToast({ title: p.checkinFail, icon: "none" });
    } finally {
      setCheckingIn(false);
    }
  }

  if (progressError && !progress) {
    return (
      <View className="engagement-vault engagement-vault--loading">
        <Text className="engagement-vault__error">{p.loadFail}</Text>
        <Button size="sm" variant="secondary" onClick={loadProgress}>
          {p.retry}
        </Button>
      </View>
    );
  }

  if (!progress) {
    return (
      <View className="engagement-vault engagement-vault--loading">
        <LoadingSkeleton count={2} variant="card" />
      </View>
    );
  }

  const checkinReward = p.checkinReward.replace("{n}", String(progress.daily_checkin_credits));

  if (variant === "compact") {
    const firstTask = progress.tasks.find((t) => !t.completed);
    return (
      <View className="engagement-vault engagement-vault--compact">
        <View
          className={clsx(
            "engagement-checkin engagement-checkin--compact",
            progress.checked_in_today && "engagement-checkin--done",
            !progress.checked_in_today && "engagement-checkin--active"
          )}
        >
          <View className="engagement-checkin__body">
            <Text className="engagement-checkin__label">{p.checkin}</Text>
            <Text className="engagement-checkin__meta">
              {progress.checked_in_today ? p.checkinDone : checkinReward}
            </Text>
          </View>
          {progress.checked_in_today ? (
            <Text className="engagement-checkin__badge">{p.taskDone}</Text>
          ) : (
            <Button variant="secondary" size="sm" loading={checkingIn} onClick={checkin}>
              {checkinReward}
            </Button>
          )}
        </View>
        {firstTask && (
          <View
            className="engagement-compact-task engagement-compact-task--clickable"
            onClick={() => {
              const url = resolveTaskRoute(firstTask.key);
              if (url?.includes("/pages/feed")) Taro.switchTab({ url });
              else if (url) Taro.navigateTo({ url });
            }}
          >
            <Text className="engagement-compact-task__reward">+{firstTask.credits}</Text>
            <Text className="engagement-compact-task__label">{firstTask.label}</Text>
            <Icon name="chevronRight" size="sm" accent />
          </View>
        )}
      </View>
    );
  }

  return (
    <View className="engagement-vault">
      {showHeader && (
        <View className="engagement-vault__head">
          <SectionLabel>{p.title}</SectionLabel>
          <CreatorLevelBadge level={progress.level} compact />
        </View>
      )}

      <View
        className={clsx(
          "engagement-checkin",
          progress.checked_in_today && "engagement-checkin--done",
          !progress.checked_in_today && "engagement-checkin--active"
        )}
      >
        <View className="engagement-checkin__icon">
          <Icon name="create" size="md" accent={!progress.checked_in_today} muted={progress.checked_in_today} />
        </View>
        <View className="engagement-checkin__body">
          <Text className="engagement-checkin__label">{p.checkin}</Text>
          <Text className="engagement-checkin__meta">
            {progress.checked_in_today ? p.checkinDone : checkinReward}
          </Text>
          {(progress.streak_days ?? 0) > 0 && (
            <Text className="engagement-checkin__streak">
              {p.streakLabel.replace("{n}", String(progress.streak_days))}
            </Text>
          )}
        </View>
        {progress.checked_in_today ? (
          <Text className="engagement-checkin__badge">{p.taskDone}</Text>
        ) : (
          <Button variant="secondary" size="sm" loading={checkingIn} onClick={checkin}>
            {checkinReward}
          </Button>
        )}
      </View>

      {referral && (
        <View className="engagement-referral">
          <View className="engagement-referral__glow" />
          <View className="engagement-referral__head">
            <View className="engagement-referral__icon-wrap">
              <Icon name="share" accent size="md" />
            </View>
            <View className="engagement-referral__head-text">
              <Text className="engagement-referral__title">{p.referralTitle}</Text>
              <Text className="engagement-referral__meta">
                {p.referralHint
                  .replace("{n}", String(referral.referrer_reward))
                  .replace("{count}", String(referral.invites_count))}
              </Text>
            </View>
          </View>
          <View
            className="engagement-referral__code-chip"
            onClick={() => {
              Taro.setClipboardData({ data: referral.referral_code });
              Taro.showToast({ title: p.referralCopied, icon: "success" });
            }}
          >
            <Text className="engagement-referral__code">{referral.referral_code}</Text>
            <Text className="engagement-referral__code-hint">{p.referralCopy}</Text>
          </View>
          <View className="engagement-referral__actions">
            <Button
              variant="primary"
              size="sm"
              block
              onClick={() => {
                Taro.setClipboardData({ data: referral.referral_code });
                Taro.showToast({ title: p.referralCopied, icon: "success" });
              }}
            >
              {p.referralCopy}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              block
              onClick={() => {
                const origin = typeof window !== "undefined" ? window.location.origin : "";
                const link = origin ? `${origin}${referral.share_url}` : referral.share_url;
                Taro.setClipboardData({ data: link });
                Taro.showToast({ title: copy.shareUi.linkCopied, icon: "success" });
              }}
            >
              {p.referralShare}
            </Button>
          </View>
        </View>
      )}

      <Text className="engagement-vault__tasks-label">{p.tasksTitle}</Text>

      <View className="engagement-vault__grid">
        {progress.tasks.map((task, index) => (
          <View
            key={task.key}
            className={clsx(
              "engagement-task-card",
              `engagement-task-card--${TASK_VARIANTS[index % TASK_VARIANTS.length]}`,
              task.completed && "engagement-task-card--done",
              !task.completed && "engagement-task-card--clickable"
            )}
            onClick={() => {
              if (task.completed) return;
              const url = resolveTaskRoute(task.key);
              if (url?.includes("/pages/feed")) Taro.switchTab({ url });
              else if (url) Taro.navigateTo({ url });
            }}
          >
            <View className="engagement-task-card__icon-wrap">
              <Icon
                name={
                  TASK_ICONS[task.key] ||
                  (task.key.startsWith("weekly_listen") ? "discover" : task.key.startsWith("weekly_journey") ? "journey" : task.key.startsWith("weekly_remix") ? "remix" : "music")
                }
                size="sm"
                accent={!task.completed}
                muted={task.completed}
              />
            </View>
            <Text className="engagement-task-card__value">{task.completed ? "✓" : `+${task.credits}`}</Text>
            <Text className="engagement-task-card__label">{task.label}</Text>
            <View className="engagement-task-card__bar" />
          </View>
        ))}
      </View>

      {wallet && (wallet.lifetime_earned > 0 || (wallet.estimated_weekly_royalty ?? 0) > 0) && (
        <View className="engagement-vault__wallet">
          <Text className="engagement-vault__wallet-title">{eco.walletTitle}</Text>
          <Text className="engagement-vault__wallet-balance">
            {eco.walletBalance.replace("{n}", String(wallet.lifetime_earned))}
          </Text>
          {(wallet.estimated_weekly_royalty ?? 0) > 0 && (
            <Text className="engagement-vault__wallet-meta">
              {copy.socialUi.walletWeeklyRoyalty.replace("{n}", String(wallet.estimated_weekly_royalty))}
            </Text>
          )}
        </View>
      )}

      <View className="engagement-vault__ledger" onClick={() => Taro.navigateTo({ url: `${STACK_PAGE_ROUTES.settings}?section=credits` })}>
        <Text className="engagement-vault__ledger-text">{p.ledgerLink}</Text>
        <Icon name="chevronRight" size="sm" />
      </View>
    </View>
  );
}
