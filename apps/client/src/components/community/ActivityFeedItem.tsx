import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { socialPage, stackPage, STUDIO_PAGE_ROUTES } from "../../constants/routes";
import { Icon } from "../ui";
import "./ActivityFeedItem.scss";

export type ActivityEvent = {
  type: string;
  at?: string | null;
  actor?: string;
  work_id?: string;
  work_title?: string;
  duel_id?: string;
  challenge_slug?: string;
  challenge_title?: string;
  credits?: number;
  message?: string;
  parent_work_id?: string;
  parent_title?: string;
  post_id?: string;
  status?: string;
};

type Props = {
  event: ActivityEvent;
};

export function ActivityFeedItem({ event }: Props) {
  const { copy } = useLocale();
  const d = copy.discoverUi;

  function open() {
    if (event.type === "duel_started" && event.duel_id) {
      Taro.navigateTo({ url: socialPage("duel", { id: event.duel_id }) });
      return;
    }
    if (event.type === "challenge_entry" && event.challenge_slug) {
      Taro.navigateTo({ url: stackPage("challenge", { slug: event.challenge_slug }) });
      return;
    }
    if (event.work_id) {
      Taro.navigateTo({ url: stackPage("work", { workId: event.work_id }) });
      return;
    }
    if (event.parent_work_id) {
      Taro.navigateTo({ url: `${STUDIO_PAGE_ROUTES.provenance}?workId=${event.parent_work_id}` });
    }
  }

  function label(): string {
    const user = event.actor || d.activitySomeone;
    if (event.type === "public_tip") {
      return d.activityPublicTip
        .replace("{user}", user)
        .replace("{title}", event.work_title || "")
        .replace("{credits}", String(event.credits ?? 1));
    }
    if (event.type === "duel_started") {
      return d.activityDuelStarted.replace("{user}", user).replace("{title}", event.work_title || "");
    }
    if (event.type === "challenge_entry") {
      return d.activityChallengeEntry
        .replace("{user}", user)
        .replace("{challenge}", event.challenge_title || "")
        .replace("{title}", event.work_title || "");
    }
    if (event.type === "work_remixed") {
      return d.activityRemixed
        .replace("{user}", user)
        .replace("{title}", event.work_title || "")
        .replace("{parent}", event.parent_title || "");
    }
    if (event.type === "work_published") {
      return d.activityPublished.replace("{user}", user).replace("{title}", event.work_title || "");
    }
    if (event.type === "post_liked") {
      return d.activityPostLiked.replace("{user}", user).replace("{title}", event.work_title || "");
    }
    if (event.type === "comment_added") {
      return d.activityCommentAdded.replace("{user}", user).replace("{title}", event.work_title || "");
    }
    if (event.type === "user_followed") {
      return d.activityUserFollowed.replace("{user}", user).replace("{target}", (event as { target_user?: string }).target_user || "");
    }
    return d.activityUnknown?.replace("{type}", event.type) || event.type;
  }

  const time = event.at ? event.at.slice(0, 16).replace("T", " ") : "";

  return (
    <View className="activity-item" onClick={open}>
      <View className="activity-item__icon">
        <Icon
          name={
            event.type === "public_tip"
              ? "heartFilled"
              : event.type === "duel_started"
                ? "remix"
                : event.type === "work_remixed"
                  ? "remix"
                  : "feed"
          }
          size="sm"
          accent
        />
      </View>
      <View className="activity-item__body">
        <Text className="activity-item__text">{label()}</Text>
        {event.message ? <Text className="activity-item__quote">「{event.message}」</Text> : null}
        {time ? <Text className="activity-item__time">{time}</Text> : null}
      </View>
    </View>
  );
}
