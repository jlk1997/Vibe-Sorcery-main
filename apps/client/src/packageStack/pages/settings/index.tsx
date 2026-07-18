import { useEffect, useRef, useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { PageShell, SectionLabel } from "../../../components/PageShell";
import { Button, ChipGroup, Input, Tag, TextArea, AuthBanner, ListRow, Card, NavTile, CreditLedgerRow, Avatar, UsageMeter } from "../../../components/ui";
import { EngagementPanel } from "../../../components/engagement/EngagementPanel";
import { vibeApi } from "../../../services/api";
import { API_BASE } from "@vibe-sorcery/api-client";
import { getItem, setItem } from "../../../platform/storage";
import { bootstrapAuth, clearToken, isLoggedIn, requireAuth } from "../../../utils/auth";
import { useCreditsOptional } from "../../../contexts/CreditsProvider";
import { LegalFooter } from "../../../components/legal/LegalFooter";
import { LEGAL_ROUTES } from "../../../utils/legal";
import { ConsentCheckbox } from "../../../components/legal/ConsentCheckbox";
import { enableAllOnboarding } from "../../../utils/onboarding";
import { STACK_PAGE_ROUTES, stackPage } from "../../../constants/routes";
import "./index.scss";

export default function SettingsPage() {
  const router = useRouter();
  const { copy, locale, setLocale } = useLocale();
  const s = copy.settingsUi;
  const w = copy.webhooks;
  const l = copy.legalUi;
  const creditsCtx = useCreditsOptional();
  const checkoutHandled = useRef(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [username, setUsername] = useState("");
  const [moodTags, setMoodTags] = useState<string[]>([]);
  const [genreTags, setGenreTags] = useState<string[]>([]);
  const [availableMoods, setAvailableMoods] = useState<string[]>([]);
  const [availableGenres, setAvailableGenres] = useState<string[]>([]);
  const [webhooks, setWebhooks] = useState<Array<{ id: string; url: string; name?: string }>>([]);
  const [webhookName, setWebhookName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSaving, setWebhookSaving] = useState(false);
  const [apiKeys, setApiKeys] = useState<Array<{ id: string; name: string; key_prefix: string }>>([]);
  const [apiUsage, setApiUsage] = useState<{ monthly_calls: number; quota: number } | null>(null);
  const [apiKeyName, setApiKeyName] = useState("");
  const [creditTx, setCreditTx] = useState<Array<{ id: string; credits: number; source: string; created_at: string | null }>>([]);
  const [isTenantAdmin, setIsTenantAdmin] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletionPending, setDeletionPending] = useState(false);
  const [supportTickets, setSupportTickets] = useState<
    Array<{ id: string; subject: string; status: string; resolution?: string; created_at?: string }>
  >([]);
  const [myExports, setMyExports] = useState<
    Array<{ id: string; export_type: string; title?: string; download_url?: string; created_at?: string }>
  >([]);
  const [myInvoices, setMyInvoices] = useState<
    Array<{ id: string; order_id: string; title: string; status: string; created_at?: string }>
  >([]);
  const [reducedMotion, setReducedMotion] = useState(() => getItem("settings:reducedMotion") === "1");
  const isH5 = process.env.TARO_ENV === "h5";
  const sup = copy.supportUi;
  const openApiDocsUrl = API_BASE.replace(/\/api\/v1\/?$/, "") + "/openapi.json";
  const embedBaseUrl =
    typeof window !== "undefined" && window.location?.origin
      ? `${window.location.origin}/packageOps/pages/embed/index`
      : "https://your-domain/packageOps/pages/embed/index";
  const embedSnippet = `<iframe src="${embedBaseUrl}?workId=WORK_ID" width="320" height="120" frameborder="0" allow="autoplay"></iframe>`;

  function openApiDocs() {
    if (typeof window !== "undefined") {
      window.open(openApiDocsUrl, "_blank", "noopener,noreferrer");
      return;
    }
    Taro.setClipboardData({ data: openApiDocsUrl });
    Taro.showToast({ title: copy.shareUi.linkCopied, icon: "success" });
  }

  function copyEmbedSnippet() {
    Taro.setClipboardData({ data: embedSnippet });
    Taro.showToast({ title: copy.shareUi.embedCopied, icon: "success" });
  }

  function toggleReducedMotion() {
    const next = !reducedMotion;
    setReducedMotion(next);
    setItem("settings:reducedMotion", next ? "1" : "0");
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("reduce-motion", next);
    }
  }

  async function refreshWebhooks() {
    if (!isH5) return;
    try {
      setWebhooks(await vibeApi.listWebhooks());
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (router.params.section !== "credits" || typeof document === "undefined") return;
    const timer = window.setTimeout(() => {
      document.getElementById("settings-credits-ledger")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [router.params.section]);

  useEffect(() => {
    bootstrapAuth();
    if (!isLoggedIn()) return;
    vibeApi
      .getMyProfile()
      .then((p) => {
        setDisplayName(p.display_name || "");
        setBio(p.bio || "");
        setAvatarUrl(p.avatar_url);
        setUsername(p.username || "");
      })
      .catch(() => {});
    vibeApi
      .getPreferences()
      .then((p) => {
        setMoodTags(p.mood_tags || []);
        setGenreTags(p.genre_tags || []);
      })
      .catch(() => {});
    vibeApi
      .getEmotionTags()
      .then((t) => {
        setAvailableMoods(t.mood_tags || []);
        setAvailableGenres(t.genre_tags || []);
      })
      .catch(() => {});
    if (isH5) void refreshWebhooks();
    vibeApi.listApiKeys().then(setApiKeys).catch(() => {});
    vibeApi.getApiUsage().then(setApiUsage).catch(() => setApiUsage(null));
    vibeApi.getCreditTransactions().then(setCreditTx).catch(() => {});
    vibeApi.me().then((u) => {
      setIsTenantAdmin(!!u.is_tenant_admin);
      setIsAdmin(!!u.is_admin);
      setDeletionPending(!!u.deletion_scheduled_at);
    }).catch(() => {});
    vibeApi.getConsentStatus().then((s) => {
      setAnalyticsConsent(!!s.analytics_consent);
      if (s.deletion_scheduled_at) setDeletionPending(true);
    }).catch(() => {});
    vibeApi.listSupportTickets().then((r) => setSupportTickets(r.tickets || [])).catch(() => {});
    vibeApi.listMyExports().then((r) => setMyExports(r.exports || [])).catch(() => {});
    vibeApi.listMyInvoices().then((r) => setMyInvoices(r.invoices || [])).catch(() => {});
  }, [isH5]);

  useEffect(() => {
    if (checkoutHandled.current || !isH5) return;
    const checkout = router.params.checkout;
    if (!checkout) return;
    checkoutHandled.current = true;
    if (checkout === "success") {
      void creditsCtx?.refresh();
      Taro.showToast({ title: s.checkoutSuccess, icon: "success" });
    } else if (checkout === "cancel") {
      Taro.showToast({ title: s.checkoutCancel, icon: "none" });
    }
  }, [isH5, router.params.checkout, creditsCtx, s.checkoutSuccess, s.checkoutCancel]);

  async function saveProfile() {
    if (!requireAuth()) return;
    try {
      await vibeApi.updateProfile(displayName.trim() || undefined, bio.trim() || undefined);
      Taro.showToast({ title: s.profileSaved, icon: "success" });
    } catch {
      Taro.showToast({ title: s.saveProfileFail, icon: "none" });
    }
  }

  async function uploadAvatar() {
    if (!requireAuth()) return;
    try {
      const pick = await Taro.chooseImage({ count: 1, sizeType: ["compressed"] });
      const filePath = pick.tempFilePaths[0];
      if (!filePath) return;
      const { storage_key, upload_url } = await vibeApi.requestAvatarUpload("image/jpeg");
      const fileData = await Taro.getFileSystemManager().readFileSync(filePath);
      await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: fileData as unknown as BodyInit,
      });
      await vibeApi.confirmAvatarUpload(storage_key);
      const profile = await vibeApi.getMyProfile();
      setAvatarUrl(profile.avatar_url);
      Taro.showToast({ title: s.profileSaved, icon: "success" });
    } catch {
      Taro.showToast({ title: s.saveProfileFail, icon: "none" });
    }
  }

  async function savePreferences() {
    if (!requireAuth()) return;
    try {
      await vibeApi.updatePreferences(moodTags, genreTags);
      Taro.showToast({ title: s.prefsDiscoverToast, icon: "success" });
    } catch {
      Taro.showToast({ title: s.savePrefsFail, icon: "none" });
    }
  }

  function toggleTag(list: string[], tag: string, setter: (v: string[]) => void) {
    setter(list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag]);
  }

  async function addWebhook() {
    const url = webhookUrl.trim();
    if (!url) {
      Taro.showToast({ title: s.webhookUrlRequired, icon: "none" });
      return;
    }
    setWebhookSaving(true);
    try {
      await vibeApi.createWebhook(webhookName.trim() || "default", url);
      setWebhookName("");
      setWebhookUrl("");
      await refreshWebhooks();
      Taro.showToast({ title: s.webhookAdded, icon: "success" });
    } catch {
      Taro.showToast({ title: s.webhookAddFail, icon: "none" });
    } finally {
      setWebhookSaving(false);
    }
  }

  async function removeWebhook(id: string) {
    try {
      await vibeApi.deleteWebhook(id);
      await refreshWebhooks();
      Taro.showToast({ title: s.webhookDeleted, icon: "success" });
    } catch {
      Taro.showToast({ title: s.webhookDeleteFail, icon: "none" });
    }
  }

  async function createApiKey() {
    if (!requireAuth()) return;
    try {
      const res = await vibeApi.createApiKey(apiKeyName.trim() || "default");
      setApiKeyName("");
      setApiKeys(await vibeApi.listApiKeys());
      Taro.showModal({ title: s.apiKeyCreated, content: res.api_key, showCancel: false });
    } catch {
      Taro.showToast({ title: s.saveProfileFail, icon: "none" });
    }
  }

  async function revokeApiKey(id: string) {
    try {
      await vibeApi.revokeApiKey(id);
      setApiKeys(await vibeApi.listApiKeys());
      Taro.showToast({ title: s.apiKeyRevoked, icon: "success" });
    } catch {
      Taro.showToast({ title: s.saveProfileFail, icon: "none" });
    }
  }

  return (
    <PageShell label={copy.navGroups.account} title={s.pageTitle} subtitle={s.pageSubtitle} wide ambient>
      {!isLoggedIn() && (
        <>
          <AuthBanner message={s.authBanner} loginLabel={copy.loginUi.login} />
          <Button variant="primary" block onClick={() => requireAuth()} className="settings-auth-cta">
            {copy.loginUi.login}
          </Button>
        </>
      )}

      {isLoggedIn() && (
        <>
      <SectionLabel>{s.profileTitle}</SectionLabel>
      <View className="settings-profile-card">
        <View className="settings-profile-card__avatar-ring">
          <Avatar name={displayName || username || "?"} src={avatarUrl} size="xl" />
        </View>
        <View className="settings-profile-card__body">
          <Text className="settings-profile-card__name">{displayName || username || "—"}</Text>
          {username ? <Text className="settings-profile-card__handle">@{username}</Text> : null}
          <View className="settings-profile-card__actions">
            <Button variant="secondary" size="sm" onClick={uploadAvatar}>
              {s.uploadAvatar}
            </Button>
            {username ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => Taro.navigateTo({ url: stackPage("user", { username }) })}
              >
                {s.viewPublicProfile}
              </Button>
            ) : null}
          </View>
        </View>
      </View>
      <Input
        label={s.displayName}
        value={displayName}
        onInput={(e) => setDisplayName(e.detail.value)}
        placeholder={s.displayNamePlaceholder}
      />
      <TextArea
        label={s.bio}
        value={bio}
        onInput={(e) => setBio(e.detail.value)}
        placeholder={s.bioPlaceholder}
        maxlength={200}
      />
      <Button variant="primary" block onClick={saveProfile}>
        {s.saveProfile}
      </Button>

      <SectionLabel>{copy.progressUi.title}</SectionLabel>
      <EngagementPanel showHeader={false} />

      <SectionLabel>{s.moodPrefs}</SectionLabel>
      <Text className="typo-meta">{s.moodPrefsHint}</Text>
      <View className="settings-tags">
        {availableMoods.slice(0, 12).map((t) => (
          <Text key={t} onClick={() => toggleTag(moodTags, t, setMoodTags)}>
            <Tag>{moodTags.includes(t) ? `✓ ${t}` : t}</Tag>
          </Text>
        ))}
      </View>
      <View className="settings-tags">
        {availableGenres.slice(0, 8).map((t) => (
          <Text key={t} onClick={() => toggleTag(genreTags, t, setGenreTags)}>
            <Tag>{genreTags.includes(t) ? `✓ ${t}` : t}</Tag>
          </Text>
        ))}
      </View>
      <Button variant="secondary" block onClick={savePreferences}>
        {s.savePrefs}
      </Button>

      <SectionLabel>{s.creditsHistoryTitle}</SectionLabel>
      <View id="settings-credits-ledger">
      {creditTx.length === 0 && <Text className="typo-meta">{s.creditsHistoryEmpty}</Text>}
      <View className="settings-ledger">
        {creditTx.slice(0, 10).map((tx) => (
          <CreditLedgerRow key={tx.id} source={tx.source} credits={tx.credits} date={tx.created_at?.slice(0, 10) || undefined} />
        ))}
      </View>
      </View>

      <SectionLabel>{s.apiKeysTitle}</SectionLabel>
      <Text className="typo-meta">{s.apiKeysHint}</Text>
      <View className="settings-api-docs">
        <Button variant="ghost" size="sm" onClick={openApiDocs}>
          {s.openApiDocs}
        </Button>
        <Button variant="ghost" size="sm" onClick={copyEmbedSnippet}>
          {s.embedDocs}
        </Button>
      </View>
      <Input label={s.apiKeyName} value={apiKeyName} onInput={(e) => setApiKeyName(e.detail.value)} />
      <Button variant="secondary" block onClick={createApiKey}>
        {s.apiKeyCreate}
      </Button>
      {apiKeys.map((k) => (
        <Card key={k.id} flat>
          <ListRow label={k.name} value={k.key_prefix} onClick={() => revokeApiKey(k.id)} showArrow={false} />
          <Button size="sm" variant="danger" onClick={() => revokeApiKey(k.id)}>
            {s.apiKeyRevoke}
          </Button>
        </Card>
      ))}

      {apiUsage && (
        <>
          <SectionLabel>{s.apiUsageTitle}</SectionLabel>
          <Text className="typo-meta">{s.apiUsageHint}</Text>
          <UsageMeter
            unit={s.apiUsageUnit}
            items={[
              {
                id: "calls",
                icon: "create",
                label: s.apiUsageTitle,
                cost: apiUsage.monthly_calls,
                maxCost: apiUsage.quota,
              },
            ]}
          />
          <Text className="typo-meta">
            {s.apiUsageSummary.replace("{n}", String(apiUsage.monthly_calls)).replace("{q}", String(apiUsage.quota))}
          </Text>
        </>
      )}
    </>
  )}

      <SectionLabel>{copy.language.title}</SectionLabel>
      <ChipGroup
        options={[
          { value: "zh", label: copy.language.zh },
          { value: "en", label: copy.language.en },
        ]}
        value={locale}
        onChange={(v) => setLocale(v as "zh" | "en")}
      />

      <SectionLabel>{s.reducedMotion}</SectionLabel>
      <Text className="typo-meta">{s.reducedMotionHint}</Text>
      <Button variant={reducedMotion ? "primary" : "secondary"} block onClick={toggleReducedMotion}>
        {reducedMotion ? "✓ " : ""}{s.reducedMotion}
      </Button>

      <SectionLabel>{s.showOnboardingAgain}</SectionLabel>
      <Text className="typo-meta">{s.showOnboardingAgainHint}</Text>
      <Button
        variant="ghost"
        block
        onClick={() => {
          enableAllOnboarding();
          Taro.showToast({ title: s.onboardingResetDone, icon: "success" });
        }}
      >
        {s.showOnboardingAgain}
      </Button>

      <SectionLabel>{s.navSection}</SectionLabel>
      <View className="settings-nav-grid">
        <NavTile icon="bell" label={s.navNotifications} tone="accent" onClick={() => Taro.navigateTo({ url: STACK_PAGE_ROUTES.notifications })} />
        <NavTile icon="journey" label={copy.emotionCalendarUi.title} tone="info" onClick={() => Taro.navigateTo({ url: STACK_PAGE_ROUTES.emotionCalendar })} />
        <NavTile icon="music" label={s.navPricing} tone="warm" onClick={() => Taro.navigateTo({ url: STACK_PAGE_ROUTES.pricing })} />
        <NavTile icon="discover" label={copy.marketplaceUi.title} tone="warm" onClick={() => Taro.navigateTo({ url: STACK_PAGE_ROUTES.marketplace })} />
        {isH5 && (
          <NavTile icon="create" label={s.navCopilot} tone="info" onClick={() => Taro.navigateTo({ url: "/packageCopilot/pages/copilot/index" })} />
        )}
        {isH5 && isAdmin && (
          <NavTile icon="profile" label={s.navAdmin} tone="neutral" onClick={() => Taro.navigateTo({ url: "/packageOps/pages/admin/index" })} />
        )}
        {(isH5 || isTenantAdmin) && (
          <NavTile icon="journey" label={s.navTenant} tone="info" onClick={() => Taro.navigateTo({ url: "/packageOps/pages/tenant/index" })} />
        )}
      </View>

      {isH5 && isLoggedIn() && (
        <>
          <SectionLabel>{w.title}</SectionLabel>
          <Text className="typo-meta">{w.description}</Text>
          <Input label={w.namePlaceholder} value={webhookName} onInput={(e) => setWebhookName(e.detail.value)} placeholder={w.namePlaceholder} />
          <Input label={w.urlPlaceholder} value={webhookUrl} onInput={(e) => setWebhookUrl(e.detail.value)} placeholder={w.urlPlaceholder} />
          <Button variant="secondary" block loading={webhookSaving} onClick={addWebhook}>
            {w.create}
          </Button>
          {webhooks.map((hook) => (
            <View key={hook.id} className="settings-webhook-row">
              <Text className="settings-webhook">{hook.name ? `${hook.name} · ` : ""}{hook.url}</Text>
              <Button size="sm" variant="ghost" onClick={() => removeWebhook(hook.id)}>
                {w.delete}
              </Button>
            </View>
          ))}
        </>
      )}

      <SectionLabel>{copy.ecosystemUi.exportHistoryTitle}</SectionLabel>
      {myExports.length === 0 && <Text className="typo-meta">{copy.ecosystemUi.exportHistoryEmpty}</Text>}
      {myExports.slice(0, 10).map((ex) => {
        const typeLabels = copy.ecosystemUi;
        const typeLabel =
          ex.export_type === "hq_mp3"
            ? typeLabels.exportTypeHqMp3
            : ex.export_type === "hq_wav"
              ? typeLabels.exportTypeHqWav
              : ex.export_type === "stems"
                ? typeLabels.exportTypeStems
                : ex.export_type === "commercial_license"
                  ? typeLabels.exportTypeCommercial
                  : ex.export_type === "mv_video"
                    ? typeLabels.exportTypeMv
                    : ex.export_type === "ai_cover"
                      ? typeLabels.exportTypeAiCover
                      : ex.export_type;
        return (
          <Card key={ex.id} flat>
            <ListRow label={ex.title || typeLabel} value={typeLabel} showArrow={false} />
            {ex.created_at && <Text className="typo-meta">{ex.created_at.slice(0, 10)}</Text>}
            {ex.download_url && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  Taro.setClipboardData({ data: ex.download_url! });
                  Taro.showToast({ title: copy.shareUi.linkCopied, icon: "success" });
                }}
              >
                {copy.shareUi.linkCopied}
              </Button>
            )}
          </Card>
        );
      })}

      <SectionLabel>{copy.ecosystemUi.invoiceHistoryTitle}</SectionLabel>
      {myInvoices.length === 0 && <Text className="typo-meta">{copy.ecosystemUi.invoiceHistoryEmpty}</Text>}
      {myInvoices.slice(0, 8).map((inv) => (
        <Card key={inv.id} flat>
          <ListRow
            label={inv.title}
            value={inv.status === "pending" ? copy.ecosystemUi.invoiceStatusPending : copy.ecosystemUi.invoiceStatusDone}
            showArrow={false}
          />
          <Text className="typo-meta">{inv.order_id}</Text>
        </Card>
      ))}
      <Button variant="ghost" block onClick={() => Taro.navigateTo({ url: STACK_PAGE_ROUTES.pricing })}>
        {copy.ecosystemUi.invoiceTitle}
      </Button>

      <SectionLabel>{sup.myTickets}</SectionLabel>
      <Text className="typo-meta">{sup.myTicketsHint}</Text>
      {supportTickets.length === 0 && <Text className="typo-meta">{sup.myTicketsEmpty}</Text>}
      {supportTickets.slice(0, 8).map((t) => (
        <Card key={t.id} flat>
          <ListRow
            label={t.subject}
            value={
              t.status === "open"
                ? sup.statusOpen
                : t.status === "in_review"
                  ? sup.statusInReview
                  : sup.statusResolved
            }
            showArrow={false}
          />
          {t.created_at && <Text className="typo-meta">{t.created_at.slice(0, 10)}</Text>}
        </Card>
      ))}
      <Button variant="ghost" block onClick={() => Taro.navigateTo({ url: STACK_PAGE_ROUTES.pricing })}>
        {sup.newTicket}
      </Button>

      <SectionLabel>{l.legalAndPrivacy}</SectionLabel>
      {deletionPending && (
        <Card flat className="settings-deletion-pending">
          <Text className="settings-deletion-pending__title">{l.deletionPendingTitle}</Text>
          <Text className="typo-meta">{l.deletionPendingBody}</Text>
          <Button variant="secondary" block onClick={async () => {
            try {
              await vibeApi.cancelAccountDeletion();
              setDeletionPending(false);
              Taro.showToast({ title: l.cancelDeletionSuccess, icon: "success" });
            } catch {
              Taro.showToast({ title: l.deleteAccountFail, icon: "none" });
            }
          }}>
            {l.cancelDeletion}
          </Button>
        </Card>
      )}
      <View className="settings-nav-grid">
        <NavTile icon="profile" label={l.privacyPolicy} tone="neutral" onClick={() => Taro.navigateTo({ url: LEGAL_ROUTES.privacy })} />
        <NavTile icon="profile" label={l.termsOfService} tone="neutral" onClick={() => Taro.navigateTo({ url: LEGAL_ROUTES.terms })} />
        <NavTile icon="create" label={l.aiServiceNotice} tone="neutral" onClick={() => Taro.navigateTo({ url: LEGAL_ROUTES.aiNotice })} />
        <NavTile icon="feed" label={l.communityGuidelines} tone="neutral" onClick={() => Taro.navigateTo({ url: LEGAL_ROUTES.communityRules })} />
        <NavTile icon="music" label={l.paymentTerms} tone="neutral" onClick={() => Taro.navigateTo({ url: LEGAL_ROUTES.paymentTerms })} />
        <NavTile icon="profile" label={l.minorProtection} tone="neutral" onClick={() => Taro.navigateTo({ url: LEGAL_ROUTES.minorProtection })} />
      </View>
      <ConsentCheckbox checked={analyticsConsent} onChange={async (v) => {
        setAnalyticsConsent(v);
        try {
          await vibeApi.updateConsents(v);
        } catch {
          setAnalyticsConsent(!v);
        }
      }}>
        {l.agreeAnalytics}
      </ConsentCheckbox>
      <Button variant="secondary" block onClick={async () => {
        try {
          const data = await vibeApi.exportMyData();
          await Taro.setClipboardData({ data: JSON.stringify(data, null, 2) });
          Taro.showToast({ title: l.exportDataSuccess, icon: "success" });
        } catch {
          Taro.showToast({ title: copy.workUi.loadFail, icon: "none" });
        }
      }}>
        {l.exportData}
      </Button>

      {isLoggedIn() && !deleteOpen && !deletionPending && (
        <Button variant="danger" block onClick={() => setDeleteOpen(true)}>
          {l.deleteAccount}
        </Button>
      )}
      {deleteOpen && (
        <Card flat>
          <Text className="typo-meta">{l.deleteAccountWarning}</Text>
          <Input label={l.deleteAccountPassword} password value={deletePassword} onInput={(e) => setDeletePassword(e.detail.value)} />
          <View className="settings-delete-actions">
            <Button variant="danger" block onClick={async () => {
              try {
                await vibeApi.deleteAccount(deletePassword || undefined);
                Taro.showToast({ title: l.deleteAccountSuccess, icon: "success" });
                clearToken();
                Taro.switchTab({ url: "/pages/profile/index" });
              } catch {
                Taro.showToast({ title: l.deleteAccountFail, icon: "none" });
              }
            }}>
              {l.deleteAccountConfirm}
            </Button>
            <Button variant="ghost" block onClick={() => setDeleteOpen(false)}>
              {l.deleteAccountCancel}
            </Button>
          </View>
        </Card>
      )}

      {isLoggedIn() && (
        <Button variant="ghost" block onClick={() => { clearToken(); Taro.switchTab({ url: "/pages/profile/index" }); }} className="settings-logout">
          {s.logout}
        </Button>
      )}
      <LegalFooter />
    </PageShell>
  );
}
