import { useEffect, useState } from "react";
import { View, Text } from "@tarojs/components";
import { useLocale } from "@vibe-sorcery/i18n";
import { vibeApi } from "../../services/api";
import { useCreditsOptional } from "../../contexts/CreditsProvider";
import "./CreditEstimateMeter.scss";

type Props = {
  mode: string;
  variations?: number;
  onCreditsChange?: (credits: number) => void;
  onLowCreditsClick?: () => void;
  /** Fetch estimate only; render nothing (e.g. create dock computes its own UI). */
  silent?: boolean;
  /** When silent, still show a compact shortfall row if balance is below estimate. */
  showShortfall?: boolean;
};

export function CreditEstimateMeter({ mode, variations, onCreditsChange, onLowCreditsClick, silent, showShortfall }: Props) {
  const { copy } = useLocale();
  const c = copy.createUi;
  const pr = copy.pricingUi;
  const creditsCtx = useCreditsOptional();
  const balance = creditsCtx?.balance;
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    vibeApi
      .estimateCredits(mode, 1, variations)
      .then((res) => {
        if (!alive) return;
        setCredits(res.credits);
        onCreditsChange?.(res.credits);
      })
      .catch(() => {
        if (!alive) return;
        const fallback = mode === "playlist" ? 3 : mode === "variation" ? variations || 3 : 1;
        setCredits(fallback);
        onCreditsChange?.(fallback);
      });
    return () => {
      alive = false;
    };
  }, [mode, variations]);

  if (credits == null) return null;

  const low = balance != null && balance < credits;
  const shortfall = balance != null && credits > balance ? credits - balance : 0;

  if (silent && !showShortfall) return null;

  if (silent && showShortfall) {
    if (!low || shortfall <= 0) return null;
    return (
      <View className="credit-estimate credit-estimate--shortfall">
        <Text className="credit-estimate__shortfall">
          {c.creditsShortfall.replace("{n}", String(shortfall))}
        </Text>
        {onLowCreditsClick && (
          <Text className="credit-estimate__topup" onClick={onLowCreditsClick}>
            {c.topUpLowCredits}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View className={`credit-estimate${low ? " credit-estimate--low" : ""}`}>
      <Text className="credit-estimate__label">{c.estimateLabel}</Text>
      <Text className="credit-estimate__value">
        {credits} {pr.creditUnit}
      </Text>
      {balance != null && (
        <Text className="credit-estimate__balance">
          {c.creditsLabel}: {balance}
        </Text>
      )}
      {low && onLowCreditsClick && (
        <Text className="credit-estimate__topup" onClick={onLowCreditsClick}>
          {c.topUpLowCredits}
        </Text>
      )}
    </View>
  );
}
