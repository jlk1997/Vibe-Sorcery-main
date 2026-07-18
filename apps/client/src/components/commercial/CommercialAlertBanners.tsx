import { useEffect, useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { useCreditsOptional } from "../../contexts/CreditsProvider";
import { requestLowCreditsSubscribeMessages } from "../../platform/wechatSubscribe";
import { STACK_PAGE_ROUTES } from "../../constants/routes";
import { Button } from "../ui";
import "./CommercialAlertBanners.scss";

const LOW_THRESHOLD = 5;

type SubscriptionLike = {
  status?: string;
  days_remaining?: number | null;
  can_manage_stripe?: boolean;
  cancel_at_period_end?: boolean;
};

type Props = {
  subscription?: SubscriptionLike | null;
};

export function CommercialAlertBanners({ subscription }: Props) {
  const { copy } = useLocale();
  const eco = copy.ecosystemUi;
  const credits = useCreditsOptional();

  const showLow =
    credits?.balance != null && credits.balance < LOW_THRESHOLD && credits.balance >= 0 && !credits.isMember;
  const showRenew =
    subscription?.status === "active" &&
    !subscription.can_manage_stripe &&
    subscription.days_remaining != null &&
    subscription.days_remaining <= 3;

  useEffect(() => {
    if (showLow && process.env.TARO_ENV === "weapp") {
      void requestLowCreditsSubscribeMessages();
    }
  }, [showLow]);

  if (!showLow && !showRenew) return null;

  return (
    <View className="commercial-alerts">
      {showLow && (
        <View className="commercial-alerts__item commercial-alerts__item--warn">
          <Text>{eco.lowCreditsBanner.replace("{n}", String(credits?.balance ?? 0))}</Text>
          <Button variant="secondary" size="sm" onClick={() => Taro.navigateTo({ url: STACK_PAGE_ROUTES.pricing })}>
            {copy.commercialUi.valuePackTitle}
          </Button>
        </View>
      )}
      {showRenew && (
        <View className="commercial-alerts__item commercial-alerts__item--info">
          <Text>{eco.renewSoonBanner.replace("{n}", String(subscription?.days_remaining ?? 0))}</Text>
          <Button variant="secondary" size="sm" onClick={() => Taro.navigateTo({ url: STACK_PAGE_ROUTES.pricing })}>
            {copy.paywallUi.subscribeNow}
          </Button>
        </View>
      )}
    </View>
  );
}
