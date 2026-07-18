import { useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { vibeApi } from "../../services/api";
import { Button } from "./Button";
import "./SubscriptionManageCard.scss";

export type SubscriptionInfo = {
  tier: string;
  status: string;
  plan_id?: string | null;
  channel?: string | null;
  monthly_credits: number;
  renews_at: string | null;
  cancel_at_period_end?: boolean;
  days_remaining?: number | null;
  perks?: { priority_queue: boolean; exclusive_presets: boolean };
  can_manage_stripe?: boolean;
};

type Props = {
  subscription: SubscriptionInfo | null;
  onUpdated?: () => void;
};

export function SubscriptionManageCard({ subscription, onUpdated }: Props) {
  const { copy } = useLocale();
  const c = copy.commercialUi;
  const [loading, setLoading] = useState<string | null>(null);

  if (!subscription || subscription.status !== "active") return null;

  async function cancelAtPeriodEnd() {
    const ok = await Taro.showModal({
      title: c.cancelTitle,
      content: c.cancelConfirm,
      confirmText: c.cancelConfirmBtn,
      cancelText: copy.actionsUi.cancel,
    });
    if (!ok.confirm) return;
    setLoading("cancel");
    try {
      await vibeApi.cancelSubscription(false);
      Taro.showToast({ title: c.cancelScheduled, icon: "success" });
      onUpdated?.();
    } catch {
      Taro.showToast({ title: c.cancelFail, icon: "none" });
    } finally {
      setLoading(null);
    }
  }

  async function openStripePortal() {
    setLoading("portal");
    try {
      const res = await vibeApi.getBillingPortal();
      if (res.url && typeof window !== "undefined") {
        window.location.href = res.url;
        return;
      }
      Taro.showToast({ title: c.portalUnavailable, icon: "none" });
    } catch {
      Taro.showToast({ title: c.portalUnavailable, icon: "none" });
    } finally {
      setLoading(null);
    }
  }

  const renewLabel = subscription.renews_at
    ? c.renewsAt.replace("{date}", subscription.renews_at.slice(0, 10))
    : "";
  const daysLeft =
    subscription.days_remaining != null
      ? c.daysRemaining.replace("{n}", String(subscription.days_remaining))
      : "";

  return (
    <View className="sub-manage">
      <Text className="sub-manage__title">{c.manageTitle}</Text>
      <Text className="typo-meta sub-manage__status">
        {subscription.cancel_at_period_end ? c.cancelPending : c.memberActive}
      </Text>
      {renewLabel && <Text className="typo-meta">{renewLabel}</Text>}
      {daysLeft && <Text className="typo-meta">{daysLeft}</Text>}
      <View className="sub-manage__perks">
        <Text className="typo-meta">· {copy.pricingUi.perkPriority}</Text>
        <Text className="typo-meta">· {copy.pricingUi.perkPresets}</Text>
      </View>
      <View className="sub-manage__actions">
        {!subscription.cancel_at_period_end && (
          <Button variant="ghost" size="sm" loading={loading === "cancel"} onClick={cancelAtPeriodEnd}>
            {c.cancelMembership}
          </Button>
        )}
        {subscription.can_manage_stripe && (
          <Button variant="secondary" size="sm" loading={loading === "portal"} onClick={openStripePortal}>
            {c.stripePortal}
          </Button>
        )}
        {!subscription.can_manage_stripe && subscription.channel && subscription.channel !== "stripe" && (
          <Text className="typo-meta">{c.cnRenewHint}</Text>
        )}
      </View>
    </View>
  );
}
