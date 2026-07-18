import { useEffect, useState } from "react";
import { View, Text } from "@tarojs/components";
import { useLocale } from "@vibe-sorcery/i18n";
import { vibeApi } from "../../services/api";
import "./MemberExportQuotas.scss";

type Quotas = Awaited<ReturnType<typeof vibeApi.getMemberExportQuotas>>;

const ROWS = [
  { key: "stems" as const, labelKey: "exportTypeStems" as const, comingSoon: true },
  { key: "hq_wav" as const, labelKey: "exportTypeHqWav" as const, comingSoon: true },
  { key: "ai_cover" as const, labelKey: "exportTypeAiCover" as const, comingSoon: false },
  { key: "mv_video" as const, labelKey: "exportTypeMv" as const, comingSoon: false },
];

export function MemberExportQuotas() {
  const { copy } = useLocale();
  const eco = copy.ecosystemUi;
  const [quotas, setQuotas] = useState<Quotas | null>(null);

  useEffect(() => {
    vibeApi.getMemberExportQuotas().then(setQuotas).catch(() => {});
  }, []);

  if (!quotas?.is_member) return null;

  return (
    <View className="member-export-quotas">
      <Text className="member-export-quotas__title">{eco.exportQuotasTitle}</Text>
      {ROWS.map(({ key, labelKey, comingSoon }) => {
        const q = quotas[key];
        if (!q?.limit) return null;
        const label = eco[labelKey];
        const suffix = comingSoon ? ` (${eco.exportComingSoon})` : "";
        return (
          <Text key={key} className="typo-meta">
            {eco.exportQuotaRow
              .replace("{label}", `${label}${suffix}`)
              .replace("{remaining}", String(q.remaining))
              .replace("{limit}", String(q.limit))}
          </Text>
        );
      })}
    </View>
  );
}
