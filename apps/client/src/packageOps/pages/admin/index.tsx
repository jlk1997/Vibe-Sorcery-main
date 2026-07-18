import { useEffect, useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { PageShell } from "../../../components/PageShell";
import { AuthBanner, Button, ChipGroup, Input } from "../../../components/ui";
import { vibeApi } from "../../../services/api";
import { bootstrapAuth, isLoggedIn, requireAuth } from "../../../utils/auth";
import "./index.scss";

type Tab = "stats" | "commercial" | "reports" | "flags" | "tenants" | "challenges" | "presets" | "activation" | "tickets" | "moderation";

export default function AdminPage() {
  const { copy } = useLocale();
  const a = copy.adminUi;
  const [tab, setTab] = useState<Tab>("stats");
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [stats, setStats] = useState<{ users: number; works: number; jobs: number } | null>(null);
  const [commercial, setCommercial] = useState<Awaited<ReturnType<typeof vibeApi.adminCommercial>> | null>(null);
  const [usage, setUsage] = useState<Record<string, unknown> | null>(null);
  const [reports, setReports] = useState<
    Array<{
      id: string;
      reason: string;
      status: string;
      comment_id?: string | null;
      comment_preview?: string | null;
      post_id?: string | null;
    }>
  >([]);
  const [flags, setFlags] = useState<Array<{ key: string; enabled: boolean; description?: string }>>([]);
  const [tenants, setTenants] = useState<Array<{ tenant_id: string; users: number; works: number; posts: number }>>([]);
  const [grantEmail, setGrantEmail] = useState("");
  const [grantAmount, setGrantAmount] = useState("10");
  const [tenantId, setTenantId] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [tenantInvite, setTenantInvite] = useState("");
  const [tenantInitialCredits, setTenantInitialCredits] = useState("100");
  const [grantPoolTenantId, setGrantPoolTenantId] = useState("");
  const [grantPoolAmount, setGrantPoolAmount] = useState("50");
  const [chSlug, setChSlug] = useState("");
  const [chTitle, setChTitle] = useState("");
  const [chHashtag, setChHashtag] = useState("");
  const [chPrizePool, setChPrizePool] = useState("30");
  const [chDuration, setChDuration] = useState("14");
  const [chSponsor, setChSponsor] = useState("");
  const [distributeChallengeId, setDistributeChallengeId] = useState("");
  const [stylePresets, setStylePresets] = useState<Array<{ id: string; label: string; category: string; enabled: boolean }>>([]);
  const [presetId, setPresetId] = useState("");
  const [presetLabel, setPresetLabel] = useState("");
  const [presetCategory, setPresetCategory] = useState("scene");
  const [presetExampleIntent, setPresetExampleIntent] = useState("");
  const [presetDescription, setPresetDescription] = useState("");
  const [activationFunnel, setActivationFunnel] = useState<Awaited<ReturnType<typeof vibeApi.adminActivationFunnel>> | null>(null);
  const [auditLogs, setAuditLogs] = useState<Array<{ id: string; action: string; target?: string; created_at?: string }>>([]);
  const [tickets, setTickets] = useState<
    Array<{
      id: string;
      category: string;
      subject: string;
      body: string;
      status: string;
      order_id?: string;
      user_email?: string;
      created_at?: string;
    }>
  >([]);
  const [resolveTicketId, setResolveTicketId] = useState("");
  const [resolveCredits, setResolveCredits] = useState("0");
  const [resolveNote, setResolveNote] = useState("");
  const [resolveRefund, setResolveRefund] = useState(false);
  const [resolveResolution, setResolveResolution] = useState<"approved" | "rejected" | "credits_granted" | "stripe_refunded">("approved");
  const [waitlist, setWaitlist] = useState<Array<{ user_id: string; email?: string; channel: string; created_at?: string }>>([]);
  const [modWords, setModWords] = useState<Array<{ id: string; pattern: string; level: string; enabled: boolean }>>([]);
  const [modPattern, setModPattern] = useState("");
  const [modLevel, setModLevel] = useState<"block" | "mask">("block");

  async function loadAdminData() {
    vibeApi
      .adminStats()
      .then((s) => setStats({ users: Number(s.users ?? 0), works: Number(s.works ?? 0), jobs: Number(s.jobs ?? 0) }))
      .catch(() => Taro.showToast({ title: a.noPermission, icon: "none" }));
    vibeApi.adminUsage().then(setUsage).catch(() => {});
    vibeApi.adminReports().then(setReports).catch(() => {});
    vibeApi.adminFlags().then(setFlags).catch(() => {});
    vibeApi.adminTenants().then(setTenants).catch(() => {});
    vibeApi.adminListPresets().then(setStylePresets).catch(() => {});
    vibeApi.adminCommercial().then(setCommercial).catch(() => {});
    vibeApi.adminActivationFunnel(30).then(setActivationFunnel).catch(() => {});
    vibeApi.adminAuditLogs(30).then(setAuditLogs).catch(() => {});
    vibeApi.adminListSupportTickets().then((r) => setTickets(r.tickets || [])).catch(() => {});
    vibeApi.adminCnRecurringWaitlist().then((r) => setWaitlist(r.entries || [])).catch(() => {});
    vibeApi.adminListModerationWords().then(setModWords).catch(() => {});
  }

  useEffect(() => {
    if (process.env.TARO_ENV !== "h5") {
      Taro.showToast({ title: a.h5Only, icon: "none" });
      return;
    }
    bootstrapAuth();
    if (!isLoggedIn()) return;
    vibeApi
      .me()
      .then((u) => {
        setIsAdmin(!!u.is_admin);
        if (u.is_admin) void loadAdminData();
      })
      .catch(() => setIsAdmin(false));
  }, [a.h5Only, a.noPermission]);

  async function resolveReport(id: string, action: "hide_post" | "hide_comment" | "dismiss") {
    if (!requireAuth()) return;
    try {
      await vibeApi.adminResolveReport(id, action);
      setReports((prev) => prev.filter((r) => r.id !== id));
      Taro.showToast({ title: a.resolved, icon: "success" });
    } catch {
      Taro.showToast({ title: a.actionFail, icon: "none" });
    }
  }

  async function toggleFlag(key: string, enabled: boolean) {
    if (!requireAuth()) return;
    try {
      await vibeApi.adminToggleFlag(key, !enabled);
      setFlags((prev) => prev.map((f) => (f.key === key ? { ...f, enabled: !enabled } : f)));
    } catch {
      Taro.showToast({ title: a.updateFail, icon: "none" });
    }
  }

  async function grantCredits() {
    if (!requireAuth()) return;
    try {
      await vibeApi.adminGrantCredits({ email: grantEmail.trim(), amount: Number(grantAmount) || 0 });
      Taro.showToast({ title: a.grantSuccess, icon: "success" });
    } catch {
      Taro.showToast({ title: a.actionFail, icon: "none" });
    }
  }

  async function createTenant() {
    if (!requireAuth()) return;
    try {
      await vibeApi.adminCreateTenant({
        tenant_id: tenantId.trim(),
        name: tenantName.trim(),
        invite_code: tenantInvite.trim() || undefined,
        initial_credits: Number(tenantInitialCredits) || 0,
      });
      Taro.showToast({ title: a.grantSuccess, icon: "success" });
      setTenants(await vibeApi.adminTenants());
    } catch {
      Taro.showToast({ title: a.actionFail, icon: "none" });
    }
  }

  async function grantTenantPool() {
    if (!requireAuth() || !grantPoolTenantId.trim()) return;
    try {
      await vibeApi.adminGrantTenantPool(grantPoolTenantId.trim(), Number(grantPoolAmount) || 0);
      Taro.showToast({ title: a.grantSuccess, icon: "success" });
      setTenants(await vibeApi.adminTenants());
    } catch {
      Taro.showToast({ title: a.actionFail, icon: "none" });
    }
  }

  async function createChallenge() {
    if (!requireAuth()) return;
    try {
      await vibeApi.createChallenge({
        slug: chSlug.trim(),
        title: chTitle.trim(),
        hashtag: chHashtag.trim() || chSlug.trim(),
        prize_pool_credits: Number(chPrizePool) || 0,
        sponsor_label: chSponsor.trim() || undefined,
        duration_days: Number(chDuration) || 14,
      });
      Taro.showToast({ title: a.grantSuccess, icon: "success" });
    } catch {
      Taro.showToast({ title: a.actionFail, icon: "none" });
    }
  }

  async function distributePrizes() {
    if (!requireAuth() || !distributeChallengeId.trim()) return;
    try {
      await vibeApi.adminDistributeChallengePrizes(distributeChallengeId.trim());
      Taro.showToast({ title: a.grantSuccess, icon: "success" });
    } catch {
      Taro.showToast({ title: a.actionFail, icon: "none" });
    }
  }

  async function createPreset() {
    if (!requireAuth() || !presetId.trim() || !presetLabel.trim()) return;
    try {
      await vibeApi.adminCreatePreset({
        id: presetId.trim(),
        label: presetLabel.trim(),
        category: presetCategory.trim() || "scene",
        description: presetDescription.trim() || undefined,
        example_intent: presetExampleIntent.trim() || undefined,
      });
      Taro.showToast({ title: a.presetCreated, icon: "success" });
      setPresetId("");
      setPresetLabel("");
      setPresetExampleIntent("");
      setPresetDescription("");
      setStylePresets(await vibeApi.adminListPresets());
    } catch {
      Taro.showToast({ title: a.actionFail, icon: "none" });
    }
  }

  async function resolveTicket() {
    if (!requireAuth() || !resolveTicketId.trim()) return;
    try {
      await vibeApi.adminResolveSupportTicket(resolveTicketId.trim(), {
        resolution: resolveResolution,
        admin_note: resolveNote.trim() || undefined,
        credits_compensation: Number(resolveCredits) || 0,
        attempt_stripe_refund: resolveRefund,
      });
      Taro.showToast({ title: a.ticketResolved, icon: "success" });
      setResolveTicketId("");
      setResolveNote("");
      setResolveCredits("0");
      setResolveRefund(false);
      const res = await vibeApi.adminListSupportTickets();
      setTickets(res.tickets || []);
    } catch {
      Taro.showToast({ title: a.actionFail, icon: "none" });
    }
  }

  async function seedDefaults() {
    try {
      await vibeApi.adminSeed();
      Taro.showToast({ title: a.seedDone, icon: "success" });
    } catch {
      Taro.showToast({ title: a.actionFail, icon: "none" });
    }
  }

  if (process.env.TARO_ENV !== "h5") {
    return (
      <PageShell title={a.title} subtitle={a.h5Only} ambient>
        <Text className="typo-meta">{a.h5Only}</Text>
      </PageShell>
    );
  }

  if (!isLoggedIn()) {
    return (
      <PageShell title={a.title} subtitle={a.loginSubtitle} showCredits={false} ambient>
        <AuthBanner message={copy.settingsUi.authBanner} loginLabel={copy.loginUi.login} />
        <Button variant="primary" block className="auth-gate__cta" onClick={() => requireAuth()}>
          {copy.loginUi.login}
        </Button>
      </PageShell>
    );
  }

  if (isAdmin === false) {
    return (
      <PageShell title={a.title} subtitle={a.noPermission} showCredits={false} ambient>
        <Text className="typo-meta">{a.noPermission}</Text>
      </PageShell>
    );
  }

  if (isAdmin === null) {
    return (
      <PageShell title={a.title} subtitle={a.subtitle} wide ambient>
        <Text className="typo-meta">{copy.provenanceUi.loading}</Text>
      </PageShell>
    );
  }

  return (
    <PageShell title={a.title} subtitle={a.subtitle} wide ambient noPadTop showCredits={false}>
      <ChipGroup
        options={[
          { value: "stats", label: a.tabStats },
          { value: "commercial", label: a.tabCommercial },
          { value: "reports", label: a.tabReports },
          { value: "flags", label: a.tabFlags },
          { value: "tenants", label: a.tabTenants },
          { value: "challenges", label: a.tabChallenges },
          { value: "presets", label: a.tabPresets || "Presets" },
          { value: "activation", label: a.tabActivation },
          { value: "tickets", label: a.tabTickets },
          { value: "moderation", label: a.tabModeration },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "commercial" && commercial && (
        <View className="admin-stats">
          <View className="admin-stat">
            <Text className="admin-stat__n">¥{commercial.billing_30d.revenue_yuan}</Text>
            <Text>{a.commercialGmv}</Text>
          </View>
          <View className="admin-stat">
            <Text className="admin-stat__n">¥{commercial.billing_30d.mrr_yuan ?? 0}</Text>
            <Text>{a.commercialMrr}</Text>
          </View>
          <View className="admin-stat">
            <Text className="admin-stat__n">¥{commercial.billing_30d.ltv_estimate_yuan ?? 0}</Text>
            <Text>{a.commercialLtv}</Text>
          </View>
          <View className="admin-stat">
            <Text className="admin-stat__n">{commercial.billing_30d.active_subscriptions ?? 0}</Text>
            <Text>{a.commercialActiveSubs}</Text>
          </View>
          <View className="admin-stat">
            <Text className="admin-stat__n">{commercial.billing_30d.churned_subscriptions ?? 0}</Text>
            <Text>{a.commercialChurn}</Text>
          </View>
          <View className="admin-stat">
            <Text className="admin-stat__n">{commercial.billing_30d.paid_orders}</Text>
            <Text>{a.commercialOrders}</Text>
          </View>
          <View className="admin-stat">
            <Text className="admin-stat__n">{commercial.total_credits_spent}</Text>
            <Text>{a.commercialSpent}</Text>
          </View>
          <View className="admin-stat">
            <Text className="admin-stat__n">{commercial.users}</Text>
            <Text>{a.commercialUsers}</Text>
          </View>
          {"duel_starts_count" in commercial && (
            <View className="admin-stat">
              <Text className="admin-stat__n">{commercial.duel_starts_count}</Text>
              <Text>{a.duelStarts}</Text>
            </View>
          )}
        </View>
      )}
      {tab === "commercial" && commercial && (
        <>
          <Text className="typo-meta">{a.packDistribution}</Text>
          {Object.entries(commercial.pack_distribution).map(([pid, count]) => (
            <View key={pid} className="admin-row">
              <Text>{pid}</Text>
              <Text className="typo-meta">{count}</Text>
            </View>
          ))}
          <Text className="typo-meta">{a.grantSources}</Text>
          {Object.entries(commercial.credit_grants_by_source).map(([src, total]) => (
            <View key={src} className="admin-row">
              <Text>{src}</Text>
              <Text className="typo-meta">+{total}</Text>
            </View>
          ))}
          {commercial.conversion_funnel_30d && (
            <>
              <Text className="typo-meta admin-funnel__title">{a.funnelTitle}</Text>
              <View className="admin-funnel">
                {(
                  [
                    ["registered", a.funnelRegistered],
                    ["first_generate", a.funnelGenerate],
                    ["work_published", a.funnelPublish],
                    ["402_insufficient", a.funnel402],
                    ["paywall_view", a.funnelPaywall],
                    ["paywall_purchase_start", a.funnelPaywallBuy],
                    ["payment_start", a.funnelPayStart],
                    ["payment_success", a.funnelPaySuccess],
                  ] as const
                ).map(([key, label]) => (
                  <View key={key} className="admin-funnel__row">
                    <Text className="admin-funnel__label">{label}</Text>
                    <Text className="admin-funnel__n">{commercial.conversion_funnel_30d[key] ?? 0}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
          <Text className="typo-meta admin-funnel__title">{a.waitlistTitle}</Text>
          {waitlist.length === 0 && <Text className="typo-meta">{a.ticketEmpty}</Text>}
          {waitlist.map((w) => (
            <View key={`${w.user_id}-${w.channel}`} className="admin-row">
              <Text>{w.email || w.user_id}</Text>
              <Text className="typo-meta">
                {a.waitlistChannel}: {w.channel}
                {w.created_at ? ` · ${w.created_at.slice(0, 10)}` : ""}
              </Text>
            </View>
          ))}
        </>
      )}

      {tab === "stats" && stats && (
        <View className="admin-stats">
          <View className="admin-stat">
            <Text className="admin-stat__n">{stats.users}</Text>
            <Text>{a.users}</Text>
          </View>
          <View className="admin-stat">
            <Text className="admin-stat__n">{stats.works}</Text>
            <Text>{a.works}</Text>
          </View>
          <View className="admin-stat">
            <Text className="admin-stat__n">{stats.jobs}</Text>
            <Text>{a.jobs}</Text>
          </View>
        </View>
      )}
      {tab === "stats" && usage && (
        <Text className="typo-meta" style={{ marginTop: "16rpx", display: "block" }}>
          {a.usageSummary}{JSON.stringify(usage).slice(0, 120)}…
        </Text>
      )}

      {tab === "reports" &&
        reports.map((r) => (
          <View key={r.id} className="admin-row">
            <View>
              <Text>{r.reason}</Text>
              {r.comment_preview ? (
                <Text className="admin-row__status">{r.comment_preview}</Text>
              ) : null}
            </View>
            <Text className="admin-row__status">{r.status}</Text>
            {r.comment_id ? (
              <Button size="sm" variant="danger" onClick={() => resolveReport(r.id, "hide_comment")}>
                {a.hideComment}
              </Button>
            ) : r.post_id ? (
              <Button size="sm" variant="danger" onClick={() => resolveReport(r.id, "hide_post")}>
                {a.hidePost}
              </Button>
            ) : null}
            <Button size="sm" variant="secondary" onClick={() => resolveReport(r.id, "dismiss")}>
              {a.dismissReport}
            </Button>
          </View>
        ))}

      {tab === "flags" &&
        flags.map((f) => (
          <View key={f.key} className="admin-row">
            <View>
              <Text className="admin-row__key">{f.key}</Text>
              {f.description && <Text className="admin-row__desc">{f.description}</Text>}
            </View>
            <Button size="sm" variant="secondary" onClick={() => toggleFlag(f.key, f.enabled)}>
              {f.enabled ? a.toggleOff : a.toggleOn}
            </Button>
          </View>
        ))}

      {tab === "tenants" && (
        <>
          {tenants.map((tn) => (
            <View key={tn.tenant_id} className="admin-row">
              <Text>{tn.tenant_id}</Text>
              <Text className="admin-row__status">
                {tn.users} users · {tn.works} works · {tn.posts} posts
              </Text>
            </View>
          ))}
          <Input label={a.tenantId} value={tenantId} onInput={(e) => setTenantId(e.detail.value)} />
          <Input label={a.tenantName} value={tenantName} onInput={(e) => setTenantName(e.detail.value)} />
          <Input label={a.tenantInvite} value={tenantInvite} onInput={(e) => setTenantInvite(e.detail.value)} />
          <Input label={a.tenantInitialCredits} value={tenantInitialCredits} onInput={(e) => setTenantInitialCredits(e.detail.value)} />
          <Button variant="primary" block onClick={createTenant}>
            {a.createTenant}
          </Button>
          <Input label={a.tenantId} value={grantPoolTenantId} onInput={(e) => setGrantPoolTenantId(e.detail.value)} />
          <Input label={a.grantPoolAmount} value={grantPoolAmount} onInput={(e) => setGrantPoolAmount(e.detail.value)} />
          <Button variant="secondary" block onClick={grantTenantPool}>
            {a.grantCredits}
          </Button>
          <Input label={a.grantEmail} value={grantEmail} onInput={(e) => setGrantEmail(e.detail.value)} />
          <Input label={a.grantAmount} value={grantAmount} onInput={(e) => setGrantAmount(e.detail.value)} />
          <Button variant="primary" block onClick={grantCredits}>
            {a.grantCredits}
          </Button>
          <Button variant="ghost" block onClick={seedDefaults}>
            {a.seedDev}
          </Button>
        </>
      )}

      {tab === "challenges" && (
        <>
          <Input label={a.challengeSlug} value={chSlug} onInput={(e) => setChSlug(e.detail.value)} />
          <Input label={a.challengeTitle} value={chTitle} onInput={(e) => setChTitle(e.detail.value)} />
          <Input label={a.challengeHashtag} value={chHashtag} onInput={(e) => setChHashtag(e.detail.value)} />
          <Input label={a.challengeSponsor} value={chSponsor} onInput={(e) => setChSponsor(e.detail.value)} />
          <Input label={a.prizePoolCredits} value={chPrizePool} onInput={(e) => setChPrizePool(e.detail.value)} />
          <Input label={a.challengeDurationDays} value={chDuration} onInput={(e) => setChDuration(e.detail.value)} />
          <Button variant="primary" block onClick={createChallenge}>
            {a.createChallenge}
          </Button>
          <Input label="Challenge ID" value={distributeChallengeId} onInput={(e) => setDistributeChallengeId(e.detail.value)} />
          <Button variant="secondary" block onClick={distributePrizes}>
            {a.distributePrizes}
          </Button>
        </>
      )}

      {tab === "presets" && (
        <>
          <Input label={a.presetId} value={presetId} onInput={(e) => setPresetId(e.detail.value)} />
          <Input label={a.presetLabel} value={presetLabel} onInput={(e) => setPresetLabel(e.detail.value)} />
          <Input label={a.presetCategory} value={presetCategory} onInput={(e) => setPresetCategory(e.detail.value)} />
          <Input label={a.presetExampleIntent} value={presetExampleIntent} onInput={(e) => setPresetExampleIntent(e.detail.value)} />
          <Input label={a.presetDescription} value={presetDescription} onInput={(e) => setPresetDescription(e.detail.value)} />
          <Button variant="primary" block onClick={createPreset}>
            {a.createPreset}
          </Button>
          {stylePresets.map((p) => (
            <View key={p.id} className="admin-row">
              <View>
                <Text className="admin-row__key">{p.label}</Text>
                <Text className="admin-row__desc">{p.id} · {p.category}</Text>
              </View>
              <Button
                size="sm"
                variant="secondary"
                disabled={!p.enabled}
                onClick={async () => {
                  try {
                    await vibeApi.adminDisablePreset(p.id);
                    setStylePresets(await vibeApi.adminListPresets());
                  } catch {
                    Taro.showToast({ title: a.actionFail, icon: "none" });
                  }
                }}
              >
                {p.enabled ? a.toggleOff : "Disabled"}
              </Button>
            </View>
          ))}
          <Button variant="ghost" block onClick={seedDefaults}>
            {a.seedDev}
          </Button>
        </>
      )}

      {tab === "activation" && activationFunnel && (
        <View className="admin-stats">
          <Text className="typo-meta">{a.activationFunnel.replace("{days}", String(activationFunnel.period_days))}</Text>
          {(
            [
              ["new_registrations", a.funnelRegistered, null],
              ["preset_selected", "选预设", "new_registrations"],
              ["first_generate_start", a.funnelGenerate, "preset_selected"],
              ["first_generate_complete", "首曲完成", "first_generate_start"],
              ["first_listen", "首次试听", "first_generate_complete"],
              ["first_publish", a.funnelPublish, "first_listen"],
            ] as const
          ).map(([key, label, prevKey]) => {
            const count = activationFunnel[key as keyof typeof activationFunnel] as number;
            const prev = prevKey
              ? (activationFunnel[prevKey as keyof typeof activationFunnel] as number)
              : activationFunnel.new_registrations;
            const pct = prev > 0 ? Math.round((count / prev) * 100) : 0;
            return (
              <View key={key} className="admin-funnel__row">
                <Text className="admin-funnel__label">{label}</Text>
                <Text className="admin-funnel__n">
                  {count}
                  {prevKey ? ` · ${pct}%` : ""}
                </Text>
              </View>
            );
          })}
          <Text className="typo-meta" style={{ marginTop: "24rpx" }}>
            {a.auditLogs}
          </Text>
          {auditLogs.map((log) => (
            <View key={log.id} className="admin-row">
              <Text>{log.action}</Text>
              <Text className="typo-meta">{log.target || ""}</Text>
            </View>
          ))}
        </View>
      )}

      {tab === "tickets" && (
        <>
          {tickets.length === 0 && <Text className="typo-meta">{a.ticketEmpty}</Text>}
          {tickets.map((t) => (
            <View key={t.id} className="admin-row admin-row--ticket">
              <View>
                <Text className="admin-row__key">{t.subject}</Text>
                <Text className="admin-row__desc">
                  {t.user_email || "—"} · {t.category} · {t.status}
                </Text>
                {t.order_id && <Text className="typo-meta">{a.ticketOrder}: {t.order_id}</Text>}
                <Text className="typo-meta">{t.body.slice(0, 160)}{t.body.length > 160 ? "…" : ""}</Text>
              </View>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setResolveTicketId(t.id);
                  setResolveResolution(t.category === "refund" ? "stripe_refunded" : "approved");
                  setResolveRefund(t.category === "refund");
                }}
              >
                {a.ticketResolve}
              </Button>
            </View>
          ))}
          <Input label="Ticket ID" value={resolveTicketId} onInput={(e) => setResolveTicketId(e.detail.value)} />
          <ChipGroup
            options={[
              { value: "approved", label: a.resolutionApproved },
              { value: "rejected", label: a.resolutionRejected },
              { value: "credits_granted", label: a.resolutionCredits },
              { value: "stripe_refunded", label: a.resolutionRefunded },
            ]}
            value={resolveResolution}
            onChange={(v) => setResolveResolution(v as typeof resolveResolution)}
          />
          <Input label={a.ticketCredits} value={resolveCredits} onInput={(e) => setResolveCredits(e.detail.value)} />
          <Input label={a.ticketNote} value={resolveNote} onInput={(e) => setResolveNote(e.detail.value)} />
          <Button variant="ghost" block onClick={() => setResolveRefund((v) => !v)}>
            {resolveRefund ? `✓ ${a.ticketRefund}` : a.ticketRefund}
          </Button>
          <Button variant="primary" block onClick={resolveTicket}>
            {a.ticketResolve}
          </Button>
        </>
      )}

      {tab === "moderation" && (
        <>
          <Input label={a.modPattern} value={modPattern} onInput={(e) => setModPattern(e.detail.value)} />
          <ChipGroup
            options={[
              { value: "block", label: a.modLevelBlock },
              { value: "mask", label: a.modLevelMask },
            ]}
            value={modLevel}
            onChange={(v) => setModLevel(v as "block" | "mask")}
          />
          <Button
            variant="primary"
            block
            onClick={async () => {
              if (!modPattern.trim()) return;
              try {
                await vibeApi.adminCreateModerationWord({ pattern: modPattern.trim(), level: modLevel });
                setModPattern("");
                const rows = await vibeApi.adminListModerationWords();
                setModWords(rows);
                Taro.showToast({ title: a.modAdded, icon: "success" });
              } catch {
                Taro.showToast({ title: a.actionFail, icon: "none" });
              }
            }}
          >
            {a.modAdd}
          </Button>
          {modWords.map((w) => (
            <View key={w.id} className="admin-row">
              <Text>
                {w.pattern} · {w.level}
              </Text>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  try {
                    await vibeApi.adminDeleteModerationWord(w.id);
                    setModWords((prev) => prev.filter((x) => x.id !== w.id));
                  } catch {
                    Taro.showToast({ title: a.actionFail, icon: "none" });
                  }
                }}
              >
                {a.modDisable}
              </Button>
            </View>
          ))}
        </>
      )}
    </PageShell>
  );
}
