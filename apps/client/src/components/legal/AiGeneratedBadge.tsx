import { View, Text } from "@tarojs/components";
import { useLocale } from "@vibe-sorcery/i18n";
import "./AiGeneratedBadge.scss";

type Props = {
  className?: string;
  compact?: boolean;
  /** 显著模式：更大、更醒目，并附带「内容由人工智能生成」说明文案，用于生成中/生成结果等核心 AI 页面。 */
  prominent?: boolean;
};

export function AiGeneratedBadge({ className, compact, prominent }: Props) {
  const { copy } = useLocale();
  const variant = prominent
    ? "ai-badge--prominent"
    : compact
      ? "ai-badge--compact"
      : "";
  return (
    <View className={`ai-badge ${variant} ${className || ""}`}>
      <Text className="ai-badge__text">{copy.legalUi.aiGeneratedBadge}</Text>
      {prominent ? (
        <Text className="ai-badge__note">{copy.legalUi.aiGeneratedNotice}</Text>
      ) : null}
    </View>
  );
}
