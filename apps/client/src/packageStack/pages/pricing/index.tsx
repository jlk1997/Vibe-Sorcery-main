import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { PageShell, SectionLabel } from "../../../components/PageShell";
import { Button, CreditBarChart, CreditLedgerRow, Input, PaymentQRModal, PricingPackCard, RingGauge, SubscriptionManageCard, UsageMeter, showError, showSuccess } from "../../../components/ui";
import { EngagementPanel } from "../../../components/engagement/EngagementPanel";
import { CommercialAlertBanners } from "../../../components/commercial/CommercialAlertBanners";
import { MemberStatsPanel } from "../../../components/engagement/MemberStatsPanel";
import { vibeApi } from "../../../services/api";
import { bootstrapAuth, isLoggedIn, requireAuth } from "../../../utils/auth";
import { useCreditsOptional } from "../../../contexts/CreditsProvider";
import { isWeappIos, payProduct } from "../../../platform/payment";
import { pollPaymentUntilPaid } from "../../../utils/paymentPoll";
import { LegalFooter } from "../../../components/legal/LegalFooter";
import { LEGAL_ROUTES } from "../../../utils/legal";
import { getRequiredVersions } from "../../../utils/consent";
import "./index.scss";

export default function PricingPage() {
  const router = useRouter();
  const { copy } = useLocale();
  const p = copy.pricingUi;
  const c = copy.commercialUi;
  const eco = copy.ecosystemUi;
  const creditsCtx = useCreditsOptional();
  const [packs, setPacks] = useState<
    Array<{
      id: string;
      label: string;
      price_cny_yuan?: number;
      credits?: number;
      duel_starts?: number;
      description?: string;
      type?: string;
    }>
  >([]);
  const [duelQuota, setDuelQuota] = useState<Awaited<ReturnType<typeof vibeApi.getDuelQuota>> | null>(null);
  const [plans, setPlans] = useState<
    Array<{ id: string; label: string; description?: string; price_cny_yuan?: number; monthly_credits: number }>
  >([]);
  const [subscription, setSubscription] = useState<Awaited<ReturnType<typeof vibeApi.getSubscription>> | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const [expandedPacks, setExpandedPacks] = useState<Set<string>>(new Set());
  const [qrPay, setQrPay] = useState<{ codeUrl: string; label: string; outTradeNo?: string } | null>(null);
  const [orders, setOrders] = useState<
    Array<{ out_trade_no: string; label: string; channel: string; amount_yuan: number; status: string }>
  >([]);
  const [creditTx, setCreditTx] = useState<Array<{ id: string; credits: number; source: string; created_at: string | null }>>([]);
  const [memberStats, setMemberStats] = useState<Awaited<ReturnType<typeof vibeApi.getProgress>>["stats"] | null>(null);
  const [paymentAgreed, setPaymentAgreed] = useState(false);
  const [paymentTermsVersion, setPaymentTermsVersion] = useState("2026-07-20");
  const [cnRecurringMsg, setCnRecurringMsg] = useState<string | null>(null);
  const [cnOnWaitlist, setCnOnWaitlist] = useState(false);
  const [cnJoining, setCnJoining] = useState(false);
  const [supportSubject, setSupportSubject] = useState("");
  const [supportBody, setSupportBody] = useState("");
  const [supportOrderId, setSupportOrderId] = useState("");
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const [invoiceOrderId, setInvoiceOrderId] = useState("");
  const [invoiceEmail, setInvoiceEmail] = useState("");
  const [invoiceTaxId, setInvoiceTaxId] = useState("");
  const [invoiceSubmitting, setInvoiceSubmitting] = useState(false);
  const isH5 = process.env.TARO_ENV === "h5";
  const isWeapp = process.env.TARO_ENV === "weapp";
  const onIos = isWeappIos();
  const balance = creditsCtx?.balance ?? 0;
  const isMember = creditsCtx?.isMember || subscription?.status === "active";
  const lastUserFetchRef = useRef(0);
  const USER_FETCH_TTL_MS = 30_000;

  useEffect(() => {
    bootstrapAuth();
    vibeApi.getCreditPacks().then(setPacks).catch(() => {});
    vibeApi.getSubscriptionPlans().then(setPlans).catch(() => {});
    vibeApi.getCnRecurringStatus().then((res) => {
      setCnRecurringMsg(res.message);
      setCnOnWaitlist(!!res.on_waitlist);
    }).catch(() => {});
    getRequiredVersions().then((v) => {
      if (v.payment) setPaymentTermsVersion(v.payment);
    });
  }, []);

  async function refreshUserData(force = false) {
    await creditsCtx?.refresh();
    if (!isLoggedIn()) return;
    const now = Date.now();
    if (!force && now - lastUserFetchRef.current < USER_FETCH_TTL_MS) return;
    lastUserFetchRef.current = now;
    const [ordersRes, txRes, subRes, progressRes, quotaRes] = await Promise.allSettled([
      vibeApi.listPaymentOrders(),
      vibeApi.getCreditTransactions(),
      vibeApi.getSubscription(),
      vibeApi.getProgress(),
      vibeApi.getDuelQuota(),
    ]);
    if (ordersRes.status === "fulfilled") setOrders(ordersRes.value);
    if (txRes.status === "fulfilled") setCreditTx(txRes.value);
    if (subRes.status === "fulfilled") setSubscription(subRes.value);
    if (progressRes.status === "fulfilled") setMemberStats(progressRes.value.stats);
    if (quotaRes.status === "fulfilled") setDuelQuota(quotaRes.value);
  }

  useDidShow(() => {
    void refreshUserData();
  });

  const featuredPackId = "pack_50";

  /** iOS Apple 支付最低 1 元：隐藏低于 1 元的额度包，避免审核与真机失败。 */
  const visiblePacks = useMemo(
    () => (onIos ? packs.filter((pack) => (pack.price_cny_yuan ?? 0) >= 1) : packs),
    [onIos, packs],
  );

  const chartItems = useMemo(
    () =>
      visiblePacks
        .filter((pack) => (pack.credits ?? 0) > 0)
        .map((pack) => ({
          id: pack.id,
          label: pack.label,
          credits: pack.credits || 0,
          price: pack.price_cny_yuan,
          featured: pack.id === featuredPackId,
        })),
    [visiblePacks, featuredPackId]
  );

  const usageItems = useMemo(
    () => [
      { id: "single", icon: "music" as const, label: p.ruleSingle, cost: 1 },
      { id: "playlist", icon: "journey" as const, label: p.rulePlaylist, cost: 3 },
      { id: "remix", icon: "remix" as const, label: p.ruleRemix, cost: 1 },
    ],
    [p]
  );

  async function refreshAfterPay() {
    await refreshUserData(true);
    const returnUrl = router.params.returnUrl;
    if (returnUrl) {
      Taro.navigateTo({ url: decodeURIComponent(returnUrl) }).catch(() => {});
    }
  }

  function orderStatusLabel(status: string) {
    if (status === "paid") return c.orderStatusPaid;
    if (status === "expired") return c.orderStatusExpired;
    if (status === "pending") return c.orderStatusPending;
    return status;
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

  async function pay(
    productId: string,
    productLabel: string,
    channel: "wechat" | "alipay" | "stripe" = isWeapp ? "wechat" : "stripe",
    amountFen?: number,
  ) {
    if (!requireAuth()) return;
    if (!(await ensurePaymentAgreed())) return;
    setBuying(`${productId}:${channel}`);
    vibeApi.trackEvent("payment_start", { product_id: productId, channel }).catch(() => {});
    try {
      const res = await payProduct(productId, channel, paymentTermsVersion, amountFen);
      if (res.mode === "mock" && res.balance != null) {
        creditsCtx?.setBalance(res.balance);
        vibeApi.trackEvent("payment_success", { product_id: productId, channel, source: "pricing" }).catch(() => {});
        Taro.showToast({ title: p.rechargeSuccess, icon: "success" });
        await refreshAfterPay();
        return;
      }
      if (res.mode === "qr" && res.codeUrl) {
        setQrPay({ codeUrl: res.codeUrl, label: productLabel, outTradeNo: res.outTradeNo });
        return;
      }
      if (res.mode === "paid") {
        if (res.outTradeNo) await pollPaymentUntilPaid(res.outTradeNo);
        await refreshAfterPay();
        vibeApi.trackEvent("payment_success", { product_id: productId, channel, source: "pricing" }).catch(() => {});
        Taro.showToast({ title: p.paySuccess, icon: "success" });
        return;
      }
      if (res.mode === "redirect") {
        await refreshAfterPay();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await Taro.showModal({
        title: p.payFail,
        content: msg || p.payFail,
        showCancel: false,
      }).catch(() => undefined);
    } finally {
      setBuying(null);
    }
  }

  return (
    <PageShell label={copy.navGroups.account} title={p.pageTitle} subtitle={isH5 ? p.subtitleH5 : p.subtitleWeapp} wide ambient>
      <View className="pricing-hero">
        <Text className="pricing-hero__title">{p.heroTitle}</Text>
        <Text className="pricing-hero__subtitle">{p.heroSubtitle}</Text>
      </View>

      {isLoggedIn() && <CommercialAlertBanners subscription={subscription} />}

      {isLoggedIn() && <EngagementPanel />}

      {isLoggedIn() && memberStats && (
        <MemberStatsPanel stats={memberStats} isMember={isMember} />
      )}

      {isLoggedIn() && subscription?.status === "active" && (
        <SubscriptionManageCard subscription={subscription} onUpdated={() => refreshUserData(true)} />
      )}

      <SectionLabel>{c.freeVsMember}</SectionLabel>
      <View className="pricing-compare-table">
        <View className="pricing-compare-table__row pricing-compare-table__head">
          <Text />
          <Text>{c.freeTier}</Text>
          <Text>{c.memberTier}</Text>
        </View>
        <View className="pricing-compare-table__row">
          <Text>{c.compareQueue}</Text>
          <Text className="typo-meta">{c.compareQueueFree}</Text>
          <Text className="typo-meta">{c.compareQueueMember}</Text>
        </View>
        <View className="pricing-compare-table__row">
          <Text>{c.comparePresets}</Text>
          <Text className="typo-meta">{c.comparePresetsFree}</Text>
          <Text className="typo-meta">{c.comparePresetsMember}</Text>
        </View>
        <View className="pricing-compare-table__row">
          <Text>{c.compareCredits}</Text>
          <Text className="typo-meta">{c.compareCreditsFree}</Text>
          <Text className="typo-meta">{c.compareCreditsMember}</Text>
        </View>
        <View className="pricing-compare-table__row">
          <Text>{p.duelCompareRow}</Text>
          <Text className="typo-meta">{p.duelCompareFree}</Text>
          <Text className="typo-meta">{p.duelCompareMember}</Text>
        </View>
      </View>

      {isLoggedIn() && duelQuota && (
        <View className="pricing-duel-quota">
          <SectionLabel>{p.duelQuotaTitle}</SectionLabel>
          {duelQuota.is_member && (
            <Text className="typo-meta">{p.duelQuotaMember.replace("{n}", String(duelQuota.member_free_remaining))}</Text>
          )}
          {duelQuota.pass_starts_remaining > 0 && (
            <Text className="typo-meta">{p.duelQuotaPass.replace("{n}", String(duelQuota.pass_starts_remaining))}</Text>
          )}
          {!duelQuota.is_member && (
            <Text className="typo-meta">{p.duelQuotaCost.replace("{n}", String(duelQuota.start_cost))}</Text>
          )}
        </View>
      )}

      <View className="pricing-value-cards">
        <View className="pricing-value-card">
          <Text className="pricing-value-card__title">{c.valueFreeTitle}</Text>
          <Text className="typo-meta">{c.valueFreeDesc}</Text>
        </View>
        <View className="pricing-value-card">
          <Text className="pricing-value-card__title">{c.valuePackTitle}</Text>
          <Text className="typo-meta">{c.valuePackDesc}</Text>
        </View>
        <View className="pricing-value-card pricing-value-card--featured">
          <Text className="pricing-value-card__title">{c.valueMemberTitle}</Text>
          <Text className="typo-meta">{c.valueMemberDesc}</Text>
        </View>
      </View>

      {isLoggedIn() && (
        <View className="pricing-balance">
          <RingGauge value={balance} max={Math.max(20, balance, plans[0]?.monthly_credits || 20)} label={p.balanceLabel} sublabel={copy.profileUi.creditsCard.replace("{n}", String(balance))} />
        </View>
      )}

      {chartItems.length > 0 && (
        <>
          <SectionLabel>{p.compareLabel}</SectionLabel>
          <CreditBarChart items={chartItems} unit={p.creditUnit} />
        </>
      )}

      <View className="pricing-consent-hint">
        <Text className="pricing-consent-hint__text">{copy.paywallUi.payConsentInline}</Text>
        <Text
          className="pricing-consent-hint__link"
          onClick={() => Taro.navigateTo({ url: LEGAL_ROUTES.paymentTerms }).catch(() => {})}
        >
          《{copy.legalUi.paymentTerms}》
        </Text>
      </View>

      <SectionLabel>{p.packsLabel}</SectionLabel>
      <View className="pricing-grid">
        {visiblePacks.map((pack) => {
          const isFeatured = pack.id === featuredPackId;
          const expanded = expandedPacks.has(pack.id);
          const amountFen = Math.round((pack.price_cny_yuan ?? 0) * 100);
          return (
          <PricingPackCard key={pack.id} label={pack.label} price={`¥${pack.price_cny_yuan ?? "—"}`} featured={isFeatured} badge={isFeatured ? p.bestValue : pack.type === "duel_pass" ? p.duelSeasonLabel : undefined}>
            {pack.type === "duel_pass" && pack.duel_starts != null ? (
              <Text className="typo-meta pricing-pack__credits">
                {pack.duel_starts}
                {p.duelStartsUnit}
              </Text>
            ) : pack.credits != null && pack.credits > 0 ? (
              <Text className="typo-meta pricing-pack__credits">
                {pack.credits} {p.creditUnit}
              </Text>
            ) : null}
            {pack.description && <Text className="typo-meta">{pack.description}</Text>}
            <Button variant="primary" size="sm" block loading={buying?.startsWith(`${pack.id}:`)} onClick={() => pay(pack.id, pack.label, isWeapp ? "wechat" : "stripe", amountFen)}>
              {isWeapp ? p.wechatPay : p.recharge}
            </Button>
            {isH5 && !expanded && (
              <Button variant="ghost" size="sm" block onClick={() => setExpandedPacks((prev) => new Set(prev).add(pack.id))}>
                {p.morePayMethods}
              </Button>
            )}
            {isH5 && expanded && (
              <View className="pricing-pack__alt">
                <Button size="sm" variant="secondary" loading={buying === `${pack.id}:alipay`} onClick={() => pay(pack.id, pack.label, "alipay", amountFen)}>
                  {p.alipay}
                </Button>
                <Button size="sm" variant="ghost" loading={buying === `${pack.id}:wechat`} onClick={() => pay(pack.id, pack.label, "wechat", amountFen)}>
                  {p.wechatQr}
                </Button>
              </View>
            )}
          </PricingPackCard>
        );
        })}
      </View>

      {plans.length > 0 && (
        <>
          <SectionLabel>{p.plansLabel}</SectionLabel>
          {plans.filter((plan) => !plan.id.startsWith("sub_team") && !plan.id.startsWith("sub_api") && !plan.id.startsWith("sub_pro")).map((plan) => {
            const isYearly = plan.id === "sub_yearly";
            const priceSuffix = isYearly ? (p.perYear || "/年") : p.perMonth;
            return (
              <PricingPackCard
                key={plan.id}
                label={plan.label}
                price={`¥${plan.price_cny_yuan}${priceSuffix}`}
                featured={!isYearly}
                badge={isYearly ? c.yearlyBadge : undefined}
              >
                <Text className="typo-meta">
                  {isYearly ? c.yearlyCredits : `${plan.monthly_credits} ${p.perMonthCredits}`}
                </Text>
                {plan.description && <Text className="typo-meta">{plan.description}</Text>}
                {subscription?.status === "active" && subscription.plan_id === plan.id && !subscription.cancel_at_period_end && (
                  <Text className="typo-meta">{p.memberActive}</Text>
                )}
                {subscription?.cancel_at_period_end && subscription.plan_id === plan.id && (
                  <Text className="typo-meta">{c.cancelPending}</Text>
                )}
                <View className="pricing-perks">
                  <Text className="typo-meta">· {p.perkPriority}</Text>
                  <Text className="typo-meta">· {p.perkPresets}</Text>
                  <Text className="typo-meta">· {p.perkBadge}</Text>
                </View>
                <Button
                  variant="primary"
                  size="sm"
                  block
                  loading={buying?.startsWith(plan.id)}
                  onClick={() => pay(plan.id, plan.label, isWeapp ? "wechat" : "stripe", Math.round((plan.price_cny_yuan ?? 0) * 100))}
                >
                  {isWeapp ? p.wechatPay : p.subscribe}
                </Button>
              </PricingPackCard>
            );
          })}
        </>
      )}

      {plans.some((plan) => plan.id.startsWith("sub_team") || plan.id.startsWith("sub_api") || plan.id.startsWith("sub_pro")) && (
        <>
          <SectionLabel>{c.b2bTitle || c.teamPlanTitle}</SectionLabel>
          {plans
            .filter((plan) => plan.id.startsWith("sub_team") || plan.id.startsWith("sub_api") || plan.id.startsWith("sub_pro"))
            .map((plan) => (
              <PricingPackCard key={plan.id} label={plan.label} price={`¥${plan.price_cny_yuan}${p.perMonth}`}>
                {plan.description && <Text className="typo-meta">{plan.description}</Text>}
                <Button variant="primary" size="sm" block loading={buying?.startsWith(plan.id)} onClick={() => pay(plan.id, plan.label, isWeapp ? "wechat" : "stripe", Math.round((plan.price_cny_yuan ?? 0) * 100))}>
                  {p.subscribe}
                </Button>
              </PricingPackCard>
            ))}
          <Text className="typo-meta">{eco.b2bSelfServeHint}</Text>
        </>
      )}

      {(isWeapp || isH5) && cnRecurringMsg && (
        <>
          <SectionLabel>{eco.cnRecurringTitle}</SectionLabel>
          <Text className="typo-meta">{cnRecurringMsg || eco.cnRecurringManual}</Text>
        </>
      )}

      {(isWeapp || isH5) && cnRecurringMsg && (
        <>
          <SectionLabel>{eco.cnRecurringTitle}</SectionLabel>
          <Text className="typo-meta">{cnRecurringMsg || eco.cnRecurringManual}</Text>
          {isLoggedIn() && !cnOnWaitlist && (
            <Button
              variant="secondary"
              size="sm"
              block
              loading={cnJoining}
              onClick={async () => {
                if (!requireAuth()) return;
                setCnJoining(true);
                try {
                  await vibeApi.joinCnRecurringWaitlist(isWeapp ? "wechat" : "alipay");
                  setCnOnWaitlist(true);
                  showSuccess(copy.supportUi.waitlistSuccess);
                } catch {
                  showError(copy.supportUi.waitlistFail);
                } finally {
                  setCnJoining(false);
                }
              }}
            >
              {copy.supportUi.waitlistJoin}
            </Button>
          )}
          {cnOnWaitlist && <Text className="typo-meta">{copy.supportUi.waitlistDone}</Text>}
        </>
      )}

      {isLoggedIn() && (
        <>
          <SectionLabel>{copy.supportUi.title}</SectionLabel>
          <Text className="typo-meta">{copy.supportUi.hint}</Text>
          <Input label={copy.supportUi.subject} value={supportSubject} onInput={(e) => setSupportSubject(e.detail.value)} />
          <Input label={copy.supportUi.orderId} value={supportOrderId} onInput={(e) => setSupportOrderId(e.detail.value)} />
          <Input label={copy.supportUi.body} value={supportBody} onInput={(e) => setSupportBody(e.detail.value)} />
          <Button
            variant="ghost"
            size="sm"
            block
            loading={supportSubmitting}
            onClick={async () => {
              if (!requireAuth() || supportSubject.trim().length < 2 || supportBody.trim().length < 10) return;
              setSupportSubmitting(true);
              try {
                await vibeApi.createSupportTicket({
                  category: "refund",
                  subject: supportSubject.trim(),
                  body: supportBody.trim(),
                  order_id: supportOrderId.trim() || undefined,
                });
                showSuccess(copy.supportUi.submitSuccess);
                setSupportSubject("");
                setSupportBody("");
                setSupportOrderId("");
              } catch {
                showError(copy.supportUi.submitFail);
              } finally {
                setSupportSubmitting(false);
              }
            }}
          >
            {copy.supportUi.submit}
          </Button>
        </>
      )}

      {isLoggedIn() && orders.length > 0 && (
        <>
          <SectionLabel>{eco.invoiceTitle}</SectionLabel>
          <Input label={eco.invoiceOrderId} value={invoiceOrderId} onInput={(e) => setInvoiceOrderId(e.detail.value)} />
          <Input label={eco.invoiceEmail} value={invoiceEmail} onInput={(e) => setInvoiceEmail(e.detail.value)} />
          <Input label={eco.invoiceTaxId} value={invoiceTaxId} onInput={(e) => setInvoiceTaxId(e.detail.value)} />
          <Button
            variant="secondary"
            size="sm"
            block
            loading={invoiceSubmitting}
            onClick={async () => {
              if (!requireAuth() || !invoiceOrderId.trim() || !invoiceEmail.trim()) return;
              setInvoiceSubmitting(true);
              try {
                await vibeApi.requestInvoice({
                  order_id: invoiceOrderId.trim(),
                  title: "炼金音坊服务",
                  email: invoiceEmail.trim(),
                  tax_id: invoiceTaxId.trim() || undefined,
                });
                showSuccess(eco.invoiceSuccess);
              } catch {
                showError(eco.exportFail);
              } finally {
                setInvoiceSubmitting(false);
              }
            }}
          >
            {eco.invoiceSubmit}
          </Button>
        </>
      )}

      <SectionLabel>{p.rulesLabel}</SectionLabel>
      <UsageMeter items={usageItems} unit={p.creditUnit} />

      {isLoggedIn() && (
        <>
          <SectionLabel>{p.ledgerTitle}</SectionLabel>
          {creditTx.length === 0 && <Text className="typo-meta">{p.ledgerEmpty}</Text>}
          {creditTx.slice(0, 12).map((tx) => (
            <CreditLedgerRow key={tx.id} source={tx.source} credits={tx.credits} date={tx.created_at?.slice(0, 10) || undefined} />
          ))}
        </>
      )}

      {orders.length > 0 && (
        <>
          <SectionLabel>{p.ordersLabel}</SectionLabel>
          {orders.slice(0, 8).map((o) => (
            <View key={o.out_trade_no} className="pricing-order">
              <Text>{o.label}</Text>
              <Text className="pricing-order__status">
                {orderStatusLabel(o.status)} · ¥{o.amount_yuan} · {o.channel}
              </Text>
            </View>
          ))}
        </>
      )}

      <SectionLabel>{c.faqTitle}</SectionLabel>
      <View className="pricing-faq">
        <View className="pricing-faq__item">
          <Text className="pricing-faq__q">{c.faqCredits}</Text>
          <Text className="typo-meta">{c.faqCreditsA}</Text>
        </View>
        <View className="pricing-faq__item">
          <Text className="pricing-faq__q">{c.faqRefund}</Text>
          <Text className="typo-meta">{c.faqRefundA}</Text>
        </View>
        <View className="pricing-faq__item">
          <Text className="pricing-faq__q">{c.faqCrossPlatform}</Text>
          <Text className="typo-meta">{c.faqCrossPlatformA}</Text>
        </View>
      </View>

      {qrPay && (
        <PaymentQRModal
          codeUrl={qrPay.codeUrl}
          label={qrPay.label}
          outTradeNo={qrPay.outTradeNo}
          onClose={() => setQrPay(null)}
          onPaid={async () => {
            setQrPay(null);
            await refreshAfterPay();
            vibeApi.trackEvent("payment_success", {}).catch(() => {});
            Taro.showToast({ title: p.creditsRefreshed, icon: "success" });
          }}
        />
      )}
      <LegalFooter />
    </PageShell>
  );
}
