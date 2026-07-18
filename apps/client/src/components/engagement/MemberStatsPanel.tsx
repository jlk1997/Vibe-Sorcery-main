import { View, Text } from "@tarojs/components";
import { useLocale } from "@vibe-sorcery/i18n";
import "./MemberStatsPanel.scss";

type Stats = {
  published: number;
  remixes: number;
  challenge_entries: number;
};

type Props = {
  stats: Stats;
  isMember?: boolean;
};

export function MemberStatsPanel({ stats, isMember }: Props) {
  const { copy } = useLocale();
  const m = copy.memberStatsUi;
  if (!isMember) return null;

  return (
    <View className="member-stats">
      <Text className="member-stats__title">{m.title}</Text>
      <View className="member-stats__grid">
        <View className="member-stats__cell">
          <Text className="member-stats__n">{stats.published}</Text>
          <Text className="member-stats__label">{m.published}</Text>
        </View>
        <View className="member-stats__cell">
          <Text className="member-stats__n">{stats.remixes}</Text>
          <Text className="member-stats__label">{m.remixes}</Text>
        </View>
        <View className="member-stats__cell">
          <Text className="member-stats__n">{stats.challenge_entries}</Text>
          <Text className="member-stats__label">{m.challenges}</Text>
        </View>
      </View>
    </View>
  );
}
