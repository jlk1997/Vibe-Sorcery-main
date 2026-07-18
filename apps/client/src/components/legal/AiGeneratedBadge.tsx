import { View, Text } from "@tarojs/components";
import { useLocale } from "@vibe-sorcery/i18n";
import "./AiGeneratedBadge.scss";

type Props = {
  className?: string;
  compact?: boolean;
};

export function AiGeneratedBadge({ className, compact }: Props) {
  const { copy } = useLocale();
  return (
    <View className={`ai-badge ${compact ? "ai-badge--compact" : ""} ${className || ""}`}>
      <Text className="ai-badge__text">{copy.legalUi.aiGeneratedBadge}</Text>
    </View>
  );
}
