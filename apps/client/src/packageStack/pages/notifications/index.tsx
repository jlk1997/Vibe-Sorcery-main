import { useState } from "react";
import { View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { PageShell } from "../../../components/PageShell";
import { NotificationCard } from "../../../components/community/NotificationCard";
import { AuthBanner, Button, ChipGroup, EmptyState, LoadingSkeleton, RingGauge } from "../../../components/ui";
import { socialPage, STACK_PAGE_ROUTES, stackPage } from "../../../constants/routes";
import { vibeApi } from "../../../services/api";
import { bootstrapAuth, isLoggedIn, requireAuth } from "../../../utils/auth";
import "./index.scss";

type NotificationItem = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  read: boolean;
  created_at: string | null;
};

type Filter = "all" | "unread";

export default function NotificationsPage() {
  const { copy } = useLocale();
  const n = copy.notificationsUi;
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  function formatMessage(item: NotificationItem): string {
    if (typeof item.payload.message === "string") return item.payload.message;
    const user = String(
      item.payload.remixer_username ||
        item.payload.follower_username ||
        item.payload.liker_username ||
        item.payload.commenter_username ||
        n.fallbackUser
    );
    if (item.type === "remix_done") return n.remixDone.replace("{user}", user);
    if (item.type === "new_follower") return n.newFollower.replace("{user}", user);
    if (item.type === "job_completed") return String(item.payload.message || n.jobCompleted);
    if (item.type === "job_failed") return String(item.payload.message || n.jobFailed);
    if (item.type === "post_liked") return n.postLiked.replace("{user}", user);
    if (item.type === "post_commented") return n.postCommented.replace("{user}", user);
    if (item.type === "subscription_expiring") {
      const days = String(item.payload.days ?? "3");
      return n.subscriptionExpiring.replace("{days}", days);
    }
    if (item.type === "low_credits") {
      const bal = String(item.payload.balance ?? "0");
      return n.lowCredits.replace("{n}", bal);
    }
    if (item.type === "duel_invite") {
      const user = String(item.payload.challenger_username || n.fallbackUser);
      return n.duelInvite.replace("{user}", user);
    }
    if (item.type === "duel_accepted") {
      const user = String(item.payload.opponent_username || n.fallbackUser);
      return n.duelAccepted.replace("{user}", user);
    }
    if (item.type === "duel_result") {
      return String(item.payload.message || n.duelResult);
    }
    if (item.type === "challenge_award") {
      const title = String(item.payload.challenge_title || "");
      const rank = String(item.payload.rank || "");
      const credits = String(item.payload.credits || "");
      return n.challengeAward.replace("{title}", title).replace("{rank}", rank).replace("{credits}", credits);
    }
    if (item.type === "challenge_ending") {
      const title = String(item.payload.challenge_title || "");
      const hours = String(item.payload.hours_left || "24");
      return n.challengeEnding.replace("{title}", title).replace("{hours}", hours);
    }
    if (item.type === "creator_weekly") {
      return String(item.payload.message || n.creatorWeekly);
    }
    if (item.type === "tip_received") {
      const credits = String(item.payload.credits || "0");
      const user = String(item.payload.from_username || n.fallbackUser);
      return n.tipReceived.replace("{user}", user).replace("{credits}", credits);
    }
    if (item.type === "mention") {
      const user = String(item.payload.commenter_username || n.fallbackUser);
      return n.mention.replace("{user}", user);
    }
    return item.type;
  }

  function formatTime(iso: string | null): string {
    if (!iso) return "";
    return iso.slice(0, 16).replace("T", " ");
  }

  function openNotification(item: NotificationItem) {
    if (item.type === "subscription_expiring" || item.type === "low_credits") {
      Taro.navigateTo({ url: STACK_PAGE_ROUTES.pricing });
      return;
    }
    if (item.type === "duel_invite" || item.type === "duel_accepted" || item.type === "duel_result") {
      const duelId = String(item.payload.duel_id || "");
      if (duelId) Taro.navigateTo({ url: socialPage("duel", { id: duelId }) });
      return;
    }
    if (item.type === "challenge_award") {
      Taro.navigateTo({ url: STACK_PAGE_ROUTES.challenges });
      return;
    }
    if (item.type === "challenge_ending") {
      const slug = String(item.payload.challenge_slug || "");
      if (slug) Taro.navigateTo({ url: stackPage("challenge", { slug }) });
      else Taro.navigateTo({ url: STACK_PAGE_ROUTES.challenges });
      return;
    }
    if (item.type === "creator_weekly") {
      Taro.navigateTo({ url: STACK_PAGE_ROUTES.creatorEarnings });
      return;
    }
    if (item.type === "job_completed" && item.payload.playlist_id) {
      Taro.navigateTo({ url: `/pages/playlist/index?id=${item.payload.playlist_id}` });
      return;
    }
    if (item.payload.work_id) {
      Taro.navigateTo({ url: `${STACK_PAGE_ROUTES.work}?workId=${item.payload.work_id}` });
    }
  }

  async function load() {
    bootstrapAuth();
    if (!isLoggedIn()) return;
    setLoading(true);
    try {
      const res = await vibeApi.getNotifications();
      setItems(res.items);
      setUnread(res.unread_count);
    } catch {
      Taro.showToast({ title: n.loadFail, icon: "none" });
    } finally {
      setLoading(false);
    }
  }

  useDidShow(load);

  async function markAllRead() {
    try {
      await vibeApi.markNotificationsRead({ all: true });
      await load();
    } catch {
      Taro.showToast({ title: n.actionFail, icon: "none" });
    }
  }

  async function tapItem(item: NotificationItem) {
    if (!item.read) {
      await vibeApi.markNotificationsRead({ notification_id: item.id }).catch(() => {});
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, read: true } : i)));
      setUnread((u) => Math.max(0, u - 1));
    }
    openNotification(item);
  }

  const visible = filter === "unread" ? items.filter((i) => !i.read) : items;

  if (!isLoggedIn()) {
    return (
      <PageShell label={copy.navGroups.account} title={n.title} subtitle={n.loginSubtitle} showCredits={false} ambient>
        <AuthBanner message={copy.settingsUi.authBanner} loginLabel={copy.loginUi.login} />
        <Button variant="primary" block className="auth-gate__cta" onClick={() => requireAuth()}>
          {copy.loginUi.login}
        </Button>
      </PageShell>
    );
  }

  return (
    <PageShell
      label={copy.navGroups.account}
      title={n.title}
      subtitle={unread > 0 ? n.unreadSubtitle.replace("{n}", String(unread)) : n.allRead}
      badge={unread > 0 ? String(unread) : undefined}
      ambient
    >
      {unread > 0 && (
        <View className="notifications-header">
          <RingGauge value={unread} max={Math.max(unread, 10)} label={n.unreadLabel} sublabel={n.unreadSubtitle.replace("{n}", String(unread))} />
          <Button variant="secondary" size="sm" onClick={markAllRead}>
            {n.markAllRead}
          </Button>
        </View>
      )}

      <ChipGroup
        options={[
          { value: "all", label: n.filterAll },
          { value: "unread", label: n.filterUnread },
        ]}
        value={filter}
        onChange={(v) => setFilter(v as Filter)}
      />

      {loading && <LoadingSkeleton count={4} variant="line" />}
      {!loading && visible.length === 0 && (
        <EmptyState iconName="bell" title={filter === "unread" ? n.emptyUnread : n.empty} />
      )}
      <View className="notifications-list">
        {visible.map((item) => (
          <NotificationCard
            key={item.id}
            type={item.type}
            message={formatMessage(item)}
            time={formatTime(item.created_at)}
            unread={!item.read}
            onClick={() => tapItem(item)}
          />
        ))}
      </View>
    </PageShell>
  );
}
