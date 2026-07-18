import { View, Text } from "@tarojs/components";
import { useLocale } from "@vibe-sorcery/i18n";
import { useCreditsOptional } from "../../contexts/CreditsProvider";
import { clsx } from "../../utils/clsx";
import "./MemberPerksBanner.scss";

type Props = {
  className?: string;
  compact?: boolean;
  onClick?: () => void;
};

export function MemberPerksBanner({ className, compact, onClick }: Props) {
  const { copy } = useLocale();
  const c = copy.commercialUi;
  const credits = useCreditsOptional();

  if (credits?.isMember) {
    return (
      <View className={clsx("member-perks member-perks--active", compact && "member-perks--compact", className)}>
        <Text className="member-perks__title">{c.memberActive}</Text>
        <Text className="member-perks__item">{c.memberPerkQueue}</Text>
        <Text className="member-perks__item">{c.memberPerkConcurrent}</Text>
      </View>
    );
  }

  return (
    <View
      className={clsx("member-perks", compact && "member-perks--compact", onClick && "member-perks--clickable", className)}
      onClick={onClick}
    >
      <Text className="member-perks__title">{c.memberPerksTitle}</Text>
      <View className="member-perks__grid">
        <Text className="member-perks__item">{c.memberPerkQueue}</Text>
        <Text className="member-perks__item">{c.memberPerkConcurrent}</Text>
        <Text className="member-perks__item">{c.memberPerkPresets}</Text>
        <Text className="member-perks__item">{c.memberPerkMonthly}</Text>
      </View>
    </View>
  );
}
