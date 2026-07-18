import { useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { PageShell, SectionLabel } from "../../../components/PageShell";
import { Button, EmptyState, LoadingSkeleton, showError, showSuccess } from "../../../components/ui";
import { vibeApi } from "../../../services/api";
import { bootstrapAuth, requireAuth } from "../../../utils/auth";
import { useCreditsOptional } from "../../../contexts/CreditsProvider";
import "./index.scss";

type Template = { id: string; title: string; description?: string; price_credits: number; author_username?: string };
type WorkPack = { id: string; title: string; price_credits: number; work_count: number; owner_username?: string };

export default function MarketplacePage() {
  const { copy } = useLocale();
  const m = copy.marketplaceUi;
  const creditsCtx = useCreditsOptional();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [packs, setPacks] = useState<WorkPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);

  useDidShow(() => {
    bootstrapAuth();
    setLoading(true);
    Promise.all([vibeApi.listRecipeTemplates(), vibeApi.listWorkPacks()])
      .then(([tpls, wp]) => {
        setTemplates(tpls);
        setPacks(wp);
      })
      .catch(() => showError(m.loadFail))
      .finally(() => setLoading(false));
  });

  async function buyTemplate(templateId: string) {
    if (!requireAuth()) return;
    setBuying(`tpl-${templateId}`);
    try {
      const res = await vibeApi.purchaseRecipeTemplate(templateId);
      await creditsCtx?.refresh();
      showSuccess(m.purchaseSuccess);
      if (res.spec) {
        Taro.setStorageSync("create:importSpec", JSON.stringify(res.spec));
        Taro.switchTab({ url: "/pages/create/index" });
      }
    } catch {
      showError(m.purchaseFail);
    } finally {
      setBuying(null);
    }
  }

  async function buyPack(packId: string) {
    if (!requireAuth()) return;
    setBuying(`pack-${packId}`);
    try {
      await vibeApi.purchaseWorkPack(packId);
      await creditsCtx?.refresh();
      showSuccess(m.purchaseSuccess);
    } catch {
      showError(m.purchaseFail);
    } finally {
      setBuying(null);
    }
  }

  return (
    <PageShell title={m.title} subtitle={m.subtitle} wide ambient>
      <SectionLabel>{m.templatesLabel}</SectionLabel>
      {loading && <LoadingSkeleton count={3} />}
      {!loading && templates.length === 0 && packs.length === 0 && (
        <EmptyState iconName="music" title={m.empty} description={m.emptyDesc} />
      )}
      {templates.map((tpl) => (
        <View key={tpl.id} className="marketplace-card">
          <Text className="marketplace-card__title">{tpl.title}</Text>
          {tpl.description && <Text className="typo-meta">{tpl.description}</Text>}
          <View className="marketplace-card__row">
            <Text className="marketplace-card__price">
              {tpl.price_credits > 0 ? m.priceCredits.replace("{n}", String(tpl.price_credits)) : m.free}
            </Text>
            <Button size="sm" variant="secondary" loading={buying === `tpl-${tpl.id}`} onClick={() => void buyTemplate(tpl.id)}>
              {tpl.price_credits > 0 ? m.buy : m.use}
            </Button>
          </View>
        </View>
      ))}

      {packs.length > 0 && <SectionLabel>{m.packsLabel}</SectionLabel>}
      {packs.map((pack) => (
        <View key={pack.id} className="marketplace-card">
          <Text className="marketplace-card__title">{pack.title}</Text>
          {pack.owner_username && <Text className="typo-meta">{m.byAuthor.replace("{user}", pack.owner_username)}</Text>}
          <Text className="typo-meta">{m.packWorks.replace("{n}", String(pack.work_count))}</Text>
          <View className="marketplace-card__row">
            <Text className="marketplace-card__price">{m.priceCredits.replace("{n}", String(pack.price_credits))}</Text>
            <Button size="sm" variant="secondary" loading={buying === `pack-${pack.id}`} onClick={() => void buyPack(pack.id)}>
              {m.packBuy}
            </Button>
          </View>
        </View>
      ))}
    </PageShell>
  );
}
