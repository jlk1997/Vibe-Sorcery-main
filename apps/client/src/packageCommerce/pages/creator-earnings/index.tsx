import { useEffect } from "react";
import { View, Text } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { PageShell } from "../../../components/PageShell";
import { AsyncPanel, Button, MetricCard } from "../../../components/ui";
import { useAsyncQuery } from "../../../hooks/useAsyncQuery";
import { vibeApi } from "../../../services/api";
import { requireAuth } from "../../../utils/auth";
import { STACK_PAGE_ROUTES } from "../../../constants/routes";
import "./index.scss";

type EarningsPayload = {
  wallet: {
    balance_credits: number;
    lifetime_earned: number;
    estimated_weekly_royalty?: number;
    recent_tips?: Array<{ amount: number; from_username?: string; created_at?: string }>;
  };
  weekly: { listens: number; tips: number; published: number; remixes: number; duel_mentions?: number } | null;
};

export default function CreatorEarningsPage() {
  const { copy } = useLocale();
  const e = copy.ecosystemUi;
  const p = copy.profileUi;
  const d = copy.discoverUi;

  const { data, loading, error, reload } = useAsyncQuery<EarningsPayload | null>(
    async () => {
      if (!requireAuth()) return null;
      const [wallet, weekly] = await Promise.all([
        vibeApi.getCreatorWallet(),
        vibeApi.getCreatorWeeklySummary(),
      ]);
      return { wallet, weekly };
    },
    []
  );

  useDidShow(() => {
    void reload();
  });

  useEffect(() => {
    Taro.setNavigationBarTitle({ title: e.earningsTitle });
  }, [e.earningsTitle]);

  const wallet = data?.wallet;
  const weekly = data?.weekly;

  return (
    <PageShell title={e.earningsTitle} showBack>
      <View className="creator-earnings">
        <AsyncPanel
          loading={loading}
          error={error}
          skeletonCount={4}
          errorIcon="profile"
          errorTitle={e.earningsLoadFail}
          errorActionLabel={d.retry}
          onRetry={() => void reload()}
        >
          {wallet && (
            <>
              <MetricCard label={e.walletBalance} value={String(wallet.balance_credits)} />
              <MetricCard label={e.walletLifetime} value={String(wallet.lifetime_earned)} />
              {wallet.estimated_weekly_royalty != null ? (
                <MetricCard label={e.estimatedRoyalty} value={String(wallet.estimated_weekly_royalty)} />
              ) : null}
              {weekly ? (
                <Text className="creator-earnings__weekly">
                  {p.weeklyDigestEngagement
                    .replace("{listens}", String(weekly.listens))
                    .replace("{tips}", String(weekly.tips))
                    .replace("{published}", String(weekly.published))
                    .replace("{remix}", String(weekly.remixes))}
                  {weekly.duel_mentions != null ? ` · ${e.duelMentions.replace("{n}", String(weekly.duel_mentions))}` : ""}
                </Text>
              ) : null}
              <Text className="creator-earnings__hint">{e.earningsWithdrawHint}</Text>
              {(wallet.recent_tips || []).length > 0 && (
                <View className="creator-earnings__tips">
                  <Text className="creator-earnings__tips-title">{e.recentTipsTitle}</Text>
                  {(wallet.recent_tips || []).map((t, i) => (
                    <Text key={i} className="creator-earnings__tips-line">
                      @{t.from_username || "?"} +{t.amount}
                    </Text>
                  ))}
                </View>
              )}
              <Button variant="secondary" block onClick={() => Taro.navigateTo({ url: STACK_PAGE_ROUTES.pricing })}>
                {e.earningsPricingCta}
              </Button>
            </>
          )}
        </AsyncPanel>
      </View>
    </PageShell>
  );
}
