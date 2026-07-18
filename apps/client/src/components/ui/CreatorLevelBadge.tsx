import { Text } from "@tarojs/components";
import { useLocale } from "@vibe-sorcery/i18n";
import "./CreatorLevelBadge.scss";

type Level = "novice" | "bronze" | "silver" | "gold" | string;

type Props = {
  level?: Level | null;
  compact?: boolean;
};

export function CreatorLevelBadge({ level, compact }: Props) {
  const { copy } = useLocale();
  if (!level || level === "novice") return null;
  const label =
    copy.progressUi.levels[level as keyof typeof copy.progressUi.levels] || level;
  return (
    <Text className={`creator-badge creator-badge--${level}${compact ? " creator-badge--compact" : ""}`}>
      {label}
    </Text>
  );
}
