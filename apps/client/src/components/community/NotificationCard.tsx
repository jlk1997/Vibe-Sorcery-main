import { View, Text } from "@tarojs/components";
import { Icon, type IconName } from "../ui/Icon";
import { clsx } from "../../utils/clsx";
import "./NotificationCard.scss";

const TYPE_ICONS: Record<string, IconName> = {
  remix_done: "remix",
  new_follower: "profile",
  job_completed: "music",
  job_failed: "stop",
  post_liked: "heartFilled",
  post_commented: "comment",
  duel_invite: "remix",
  duel_accepted: "remix",
  duel_result: "flag",
  mention: "comment",
  challenge_award: "flag",
  challenge_ending: "flag",
  tip_received: "heartFilled",
  creator_weekly: "feed",
};

const TYPE_TONES: Record<string, "accent" | "info" | "warm" | "danger"> = {
  remix_done: "info",
  new_follower: "accent",
  job_completed: "accent",
  job_failed: "danger",
  post_liked: "warm",
  post_commented: "info",
  duel_invite: "accent",
  duel_accepted: "info",
  duel_result: "warm",
  mention: "info",
  challenge_award: "accent",
  challenge_ending: "warm",
  tip_received: "warm",
  creator_weekly: "info",
};

type Props = {
  type: string;
  message: string;
  time?: string;
  unread?: boolean;
  onClick?: () => void;
};

export function NotificationCard({ type, message, time, unread, onClick }: Props) {
  const icon = TYPE_ICONS[type] || "bell";
  const tone = TYPE_TONES[type] || "accent";

  return (
    <View className={clsx("notification-card", unread && "notification-card--unread", onClick && "notification-card--clickable")} onClick={onClick}>
      <View className={clsx("notification-card__icon", `notification-card__icon--${tone}`)}>
        <Icon name={icon} accent size="md" />
      </View>
      <View className="notification-card__body">
        <Text className="notification-card__message">{message}</Text>
        {time && <Text className="notification-card__time">{time}</Text>}
      </View>
      {unread && <View className="notification-card__dot" />}
      {onClick && <Text className="notification-card__arrow">›</Text>}
    </View>
  );
}
