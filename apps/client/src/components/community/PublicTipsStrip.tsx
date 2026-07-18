import { useEffect, useState } from "react";
import { View, Text } from "@tarojs/components";
import { useLocale } from "@vibe-sorcery/i18n";
import { vibeApi } from "../../services/api";
import "./PublicTipsStrip.scss";

type Props = {
  workId: string;
};

export function PublicTipsStrip({ workId }: Props) {
  const { copy } = useLocale();
  const social = copy.socialUi;
  const [tips, setTips] = useState<Array<{ username: string; credits: number; message?: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    vibeApi
      .getPublicTips(workId)
      .then((res) => {
        if (!cancelled) setTips((res.tips || []).slice(0, 3));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [workId]);

  if (!tips.length) return null;

  return (
    <View className="public-tips-strip">
      <Text className="public-tips-strip__title">{social.publicTipsTitle}</Text>
      {tips.map((t, i) => (
        <Text key={i} className="public-tips-strip__line">
          @{t.username} +{t.credits}
          {t.message ? `：${t.message}` : ""}
        </Text>
      ))}
    </View>
  );
}
