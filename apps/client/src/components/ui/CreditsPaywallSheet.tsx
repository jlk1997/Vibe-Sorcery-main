import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { vibeApi } from "../../services/api";
import { useCreditsOptional } from "../../contexts/CreditsProvider";
import { payProduct, type PaymentChannel } from "../../platform/payment";
import { pollPaymentUntilPaid } from "../../utils/paymentPoll";
import { getRequiredVersions } from "../../utils/consent";
import { LEGAL_ROUTES } from "../../utils/legal";
import { requestLowCreditsSubscribeMessages } from "../../platform/wechatSubscribe";
import { stackPage } from "../../constants/routes";
import { BottomSheet, Button, PaymentQRModal, PricingPackCard } from "./index";
import "./CreditsPaywallSheet.scss";

type Props = {
  open: boolean;
  requiredCredits: number;
  onClose: () => void;
  onSuccess?: () => void;
  returnPath?: string;
  source?: string;
  initialTab?: "member" | "pack";
};

type Pack = { id: string; label: string; credits?: number; price_cny_yuan?: number };
type Plan = {
  id: string;
  label: string;
  description?: string;
  price_cny_yuan?: number;
  monthly_credits: number;
  upfront_credits?: number;
};

let packsCache: Pack[] | null = null;
let plansCache: Plan[] | null = null;
let cacheTs = 0;
const CACHE_TTL_MS = 5 * 60_000;

async function loadCatalog() {
  if (packsCache && plansCache && Date.now() - cacheTs < CACHE_TTL_MS) {
    return { packs: packsCache, plans: plansCache };
  }
  const [packs, plans] = await Promise.all([vibeApi.getCreditPacks(), vibeApi.getSubscriptionPlans()]);
  packsCache = packs;
  plansCache = plans;
  cacheTs = Date.now();
  return { packs, plans };
}

export function CreditsPaywallSheet({
  open,
  requiredCredits,
  onClose,
  onSuccess,
  returnPath,
  source = "unknown",
  initialTab = "member",
}: Props) {
  const { copy } = useLocale();
  const p = copy.paywallUi;
  const pr = copy.pricingUi;
  const c = copy.commercialUi;
  const creditsCtx = useCreditsOptional();
  const balance = creditsCtx?.balance ?? 0;
  const shortfall = Math.max(0, requiredCredits - balance);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [tab, setTab] = useState<"member" | "pack">("member");
  const [buying, setBuying] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [paymentAgreed, setPaymentAgreed] = useState(false);
  const [paymentTermsVersion, setPaymentTermsVersion] = useState("2026-07-08");
  const [qrPay, setQrPay] = useState<{ codeUrl: string; label: string; outTradeNo?: string } | null>(null);
  const trackedOpenRef = useRef(false);
  const isWeapp = process.env.TARO_ENV === "weapp";
  const isH5 = process.env.TARO_ENV === "h5";

  useEffect(() => {
    getRequiredVersions().then((v) => {
      if (v.payment) setPaymentTermsVersion(v.payment);
    });
  }, []);

  useEffect(() => {
    if (!open) {
      trackedOpenRef.current = false;
      return;
    }
    setTab(initialTab);
    loadCatalog()
      .then(({ packs: pk, plans: pl }) => {
        setPacks(pk);
        setPlans(pl);
      })
      .catch(() => {});
    if (!trackedOpenRef.current) {
      trackedOpenRef.current = true;
      void requestLowCreditsSubscribeMessages();
      vibeApi.trackEvent("paywall_view", { source, required: requiredCredits, balance, shortfall }).catch(() => {});
    }
  }, [open, source, requiredCredits, balance, shortfall, initialTab]);

  const monthlyPlan = plans.find((pl) => pl.id === "sub_monthly");
  const yearlyPlan = plans.find((pl) => pl.id === "sub_yearly");
  const featuredPlan = yearlyPlan || monthlyPlan;

  const recommended =
    packs.find((pk) => pk.id === "pack_50") || [...packs].sort((a, b) => (b.credits || 0) - (a.credits || 0))[0];

  const roi = useMemo(() => {
    if (!monthlyPlan?.price_cny_yuan || !recommended?.credits || !recommended.price_cny_yuan) return null;
    const packPerCredit = recommended.price_cny_yuan / recommended.credits;
    const memberCredits = monthlyPlan.monthly_credits || 30;
    const memberPerCredit = monthlyPlan.price_cny_yuan / memberCredits;
    const save = Math.max(0, Math.round((packPerCredit - memberPerCredit) * memberCredits));
    return { packPerCredit: packPerCredit.toFixed(2), memberPerCredit: memberPerCredit.toFixed(2), save };
  }, [monthlyPlan, recommended]);

  function dismiss() {
    vibeApi.trackEvent("paywall_dismiss", { source }).catch(() => {});
    onClose();
  }

  async function syncBalanceAfterPay(res: Awaited<ReturnType<typeof payProduct>>) {
    if (res.mode === "mock" && res.balance != null) {
      creditsCtx?.setBalance(res.balance);
      return;
    }
    if (res.mode === "paid" && res.outTradeNo) {
      const paid = await pollPaymentUntilPaid(res.outTradeNo);
      if (paid?.balance != null) {
        creditsCtx?.setBalance(paid.balance);
        return;
      }
    }
    await creditsCtx?.refresh();
  }

  async function ensurePaymentAgreed(): Promise<boolean> {
    if (paymentAgreed) return true;
    const res = await Taro.showModal({
      title: copy.legalUi.payConsentTitle,
      content: copy.legalUi.agreePaymentTerms,
      confirmText: copy.legalUi.agreeAndPay,
      cancelText: copy.legalUi.viewTerms,
    }).catch(() => ({ confirm: false, cancel: false }));
    if (res.confirm) {
      setPaymentAgreed(true);
      return true;
    }
    if (res.cancel) {
      Taro.navigateTo({ url: LEGAL_ROUTES.paymentTerms }).catch(() => {});
    }
    return false;
  }

  async function buy(productId: string, channel: PaymentChannel = isWeapp ? "wechat" : "stripe") {
    if (!(await ensurePaymentAgreed())) {
      return;
    }
    setBuying(`${productId}:${channel}`);
    vibeApi.trackEvent("paywall_purchase_start", { source, product_id: productId, channel }).catch(() => {});
    try {
      const res = await payProduct(productId, channel, paymentTermsVersion);
      if (res.mode === "qr" && res.codeUrl) {
        const label =
          plans.find((pl) => pl.id === productId)?.label || packs.find((pk) => pk.id === productId)?.label || productId;
        setQrPay({ codeUrl: res.codeUrl, label, outTradeNo: res.outTradeNo });
        return;
      }
      if (res.mode === "unsupported") {
        await Taro.showModal({
          title: copy.legalUi.iosPayUnsupportedTitle,
          content: copy.legalUi.iosPayUnsupportedBody,
          showCancel: false,
        }).catch(() => undefined);
        return;
      }
      if (res.mode !== "redirect") {
        await syncBalanceAfterPay(res);
        vibeApi.trackEvent("payment_success", { source: "paywall", product_id: productId, channel }).catch(() => {});
        Taro.showToast({ title: pr.rechargeSuccess, icon: "success" });
        onSuccess?.();
        onClose();
      }
    } catch {
      Taro.showToast({ title: pr.payFail, icon: "none" });
    } finally {
      setBuying(null);
    }
  }

  if (!open) return null;

  return (
    <>
      <BottomSheet open={open && !qrPay} onClose={dismiss} title={p.title}>
        <View className="paywall-sheet">
          <Text className="paywall-sheet__hint">
            {p.needCredits.replace("{n}", String(requiredCredits)).replace("{balance}", String(balance))}
          </Text>
          {shortfall > 0 && (
            <Text className="paywall-sheet__shortfall">{p.shortfall.replace("{n}", String(shortfall))}</Text>
          )}

          {source.startsWith("create") && (
            <View className="paywall-sheet__create-context">
              <Text className="paywall-sheet__create-hint">{p.createCostHint}</Text>
              <Text className="paywall-sheet__create-compare">{p.createCompare}</Text>
            </View>
          )}

          <View className="paywall-sheet__tabs">
            <View
              className={`paywall-sheet__tab ${tab === "member" ? "paywall-sheet__tab--active" : ""}`}
              onClick={() => setTab("member")}
            >
              <Text>{p.tabMember}</Text>
            </View>
            <View
              className={`paywall-sheet__tab ${tab === "pack" ? "paywall-sheet__tab--active" : ""}`}
              onClick={() => setTab("pack")}
            >
              <Text>{p.tabPack}</Text>
            </View>
          </View>

          <View className="paywall-sheet__consent-hint">
            <Text className="paywall-sheet__consent-text">{copy.paywallUi.payConsentInline}</Text>
            <Text
              className="paywall-sheet__consent-link"
              onClick={() => Taro.navigateTo({ url: LEGAL_ROUTES.paymentTerms }).catch(() => {})}
            >
              《{copy.legalUi.paymentTerms}》
            </Text>
          </View>

          {tab === "member" && featuredPlan && (
            <View className="paywall-sheet__member">
              <Text className="paywall-sheet__badge">{p.memberRecommend}</Text>
              <PricingPackCard
                label={featuredPlan.label}
                price={`¥${featuredPlan.price_cny_yuan ?? "—"}`}
                featured
                badge={featuredPlan.id === "sub_yearly" ? c.yearlyBadge : undefined}
              >
                <Text className="typo-meta">{featuredPlan.description}</Text>
                <Text className="typo-meta">
                  {p.creditsPerMonth.replace("{n}", String(featuredPlan.monthly_credits))}
                </Text>
                <View className="paywall-sheet__perks">
                  <Text className="paywall-sheet__perk">{c.memberPerkQueue}</Text>
                  <Text className="paywall-sheet__perk">{c.memberPerkPresets}</Text>
                  <Text className="paywall-sheet__perk">{c.memberPerkMonthly}</Text>
                </View>
                {roi && (
                  <View className="paywall-sheet__roi">
                    <Text className="paywall-sheet__roi-title">{p.roiTitle}</Text>
                    <Text className="paywall-sheet__roi-line">
                      {p.roiSave.replace("{amount}", String(roi.save))}
                    </Text>
                  </View>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  block
                  loading={buying?.startsWith(`${featuredPlan.id}:`)}
                  onClick={() => buy(featuredPlan.id, isWeapp ? "wechat" : "stripe")}
                >
                  {p.subscribeNow}
                </Button>
              </PricingPackCard>
              {monthlyPlan && featuredPlan.id !== "sub_monthly" && (
                <Button variant="ghost" size="sm" block onClick={() => buy("sub_monthly", isWeapp ? "wechat" : "stripe")}>
                  {monthlyPlan.label} · ¥{monthlyPlan.price_cny_yuan}
                </Button>
              )}
            </View>
          )}

          {tab === "pack" && recommended && (
            <>
              <PricingPackCard
                label={recommended.label}
                price={`¥${recommended.price_cny_yuan ?? "—"}`}
                featured
                badge={pr.bestValue}
              >
                {recommended.credits != null && (
                  <Text className="typo-meta">
                    {recommended.credits} {pr.creditUnit}
                  </Text>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  block
                  loading={buying === `${recommended.id}:wechat` || buying === `${recommended.id}:stripe`}
                  onClick={() => buy(recommended.id, isWeapp ? "wechat" : "stripe")}
                >
                  {isWeapp ? pr.wechatPay : pr.stripe}
                </Button>
                {isH5 && (
                  <View className="paywall-sheet__alt">
                    <Button size="sm" variant="secondary" loading={buying === `${recommended.id}:alipay`} onClick={() => buy(recommended.id, "alipay")}>
                      {pr.alipay}
                    </Button>
                    <Button size="sm" variant="ghost" loading={buying === `${recommended.id}:wechat`} onClick={() => buy(recommended.id, "wechat")}>
                      {pr.wechatQr}
                    </Button>
                  </View>
                )}
              </PricingPackCard>
              {!expanded && packs.length > 1 && (
                <Button variant="ghost" size="sm" block onClick={() => setExpanded(true)}>
                  {p.moreOptions}
                </Button>
              )}
              {expanded &&
                packs
                  .filter((pk) => pk.id !== recommended?.id)
                  .map((pk) => (
                    <PricingPackCard key={pk.id} label={pk.label} price={`¥${pk.price_cny_yuan ?? "—"}`}>
                      <Button variant="secondary" size="sm" loading={buying?.startsWith(`${pk.id}:`)} onClick={() => buy(pk.id, isWeapp ? "wechat" : "stripe")}>
                        {pr.recharge}
                      </Button>
                    </PricingPackCard>
                  ))}
            </>
          )}

          <Button
            variant="ghost"
            block
            onClick={() => {
              Taro.navigateTo({ url: stackPage("pricing", returnPath ? { returnUrl: returnPath } : undefined) });
            }}
          >
            {p.viewAll}
          </Button>
        </View>
      </BottomSheet>
      {qrPay && (
        <PaymentQRModal
          codeUrl={qrPay.codeUrl}
          label={qrPay.label}
          outTradeNo={qrPay.outTradeNo}
          onClose={() => setQrPay(null)}
          onPaid={async () => {
            setQrPay(null);
            await creditsCtx?.refresh();
            vibeApi.trackEvent("payment_success", { source: "paywall", channel: "wechat" }).catch(() => {});
            Taro.showToast({ title: pr.rechargeSuccess, icon: "success" });
            onSuccess?.();
            onClose();
          }}
        />
      )}
    </>
  );
}
