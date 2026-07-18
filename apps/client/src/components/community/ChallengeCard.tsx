import { View, Text, Image } from "@tarojs/components";
import { Icon, StatPill } from "../ui";
import { clsx } from "../../utils/clsx";
import "./ChallengeCard.scss";

type Props = {
  title: string;
  hashtag: string;
  coverUrl?: string;
  participantCount: number;
  participantsLabel: string;
  endsAt?: string | null;
  deadlinePrefix?: string;
  prizePoolCredits?: number;
  prizePoolLabel?: string;
  featured?: boolean;
  onClick?: () => void;
};

export function ChallengeCard({
  title,
  hashtag,
  coverUrl,
  participantCount,
  participantsLabel,
  endsAt,
  deadlinePrefix,
  prizePoolCredits,
  prizePoolLabel,
  featured,
  onClick,
}: Props) {
  return (
    <View className={clsx("challenge-card", featured && "challenge-card--featured")} onClick={onClick}>
      <View className="challenge-card__hero">
        {coverUrl ? (
          <Image className="challenge-card__cover" src={coverUrl} mode="aspectFill" />
        ) : (
          <View className="challenge-card__cover challenge-card__cover--fallback">
            <Icon name="flag" size="lg" accent />
          </View>
        )}
        <View className="challenge-card__gradient" />
        <View className="challenge-card__badge">
          <Text className="challenge-card__hashtag">{hashtag}</Text>
        </View>
        {featured && (
          <View className="challenge-card__featured-tag">
            <Icon name="heartFilled" size="sm" />
            <Text>{participantsLabel.replace("{n}", String(participantCount))}</Text>
          </View>
        )}
      </View>
      <View className="challenge-card__body">
        <Text className="challenge-card__title">{title}</Text>
        <View className="challenge-card__meta">
          <StatPill label={participantsLabel.replace("{n}", String(participantCount))} variant="accent" />
          {prizePoolCredits != null && prizePoolCredits > 0 && prizePoolLabel && (
            <StatPill label={prizePoolLabel.replace("{n}", String(prizePoolCredits))} variant="warm" />
          )}
          {endsAt && deadlinePrefix && (
            <StatPill label={`${deadlinePrefix}${endsAt.slice(0, 10)}`} variant="muted" />
          )}
        </View>
      </View>
    </View>
  );
}
