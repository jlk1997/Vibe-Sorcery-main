import { useEffect, useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { PageShell, SectionLabel } from "../../../components/PageShell";
import { AuthBanner, Button, Card, Input } from "../../../components/ui";
import { vibeApi } from "../../../services/api";
import { bootstrapAuth, isLoggedIn, requireAuth } from "../../../utils/auth";
import "./index.scss";

export default function TenantAdminPage() {
  const { copy } = useLocale();
  const t = copy.tenantAdminUi;
  const [dash, setDash] = useState<{
    tenant_id: string;
    name: string;
    credit_pool: number;
    member_count: number;
    embed: { brand: string; logo_url?: string };
  } | null>(null);
  const [members, setMembers] = useState<Array<{ username: string; email: string; balance: number }>>([]);
  const [brand, setBrand] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [accent, setAccent] = useState("#d4af6a");
  const [allocEmail, setAllocEmail] = useState("");
  const [allocAmount, setAllocAmount] = useState("10");

  useEffect(() => {
    bootstrapAuth();
    if (!isLoggedIn()) return;
    vibeApi
      .getTenantAdmin()
      .then((d) => {
        setDash(d);
        setBrand(d.embed.brand || d.name);
        setLogoUrl(d.embed.logo_url || "");
      })
      .catch(() => Taro.showToast({ title: t.noPermission, icon: "none" }));
    vibeApi.getTenantMembers().then(setMembers).catch(() => {});
  }, [t.noPermission]);

  async function saveEmbed() {
    if (!requireAuth()) return;
    try {
      await vibeApi.updateTenantEmbed({ brand, logo_url: logoUrl, accent_color: accent });
      Taro.showToast({ title: t.saveEmbed, icon: "success" });
    } catch {
      Taro.showToast({ title: t.loadFail, icon: "none" });
    }
  }

  async function allocate() {
    if (!requireAuth()) return;
    try {
      await vibeApi.allocateTenantCredits(allocEmail.trim(), Number(allocAmount) || 0);
      Taro.showToast({ title: t.allocateSuccess, icon: "success" });
      const d = await vibeApi.getTenantAdmin();
      setDash(d);
      setMembers(await vibeApi.getTenantMembers());
    } catch {
      Taro.showToast({ title: t.loadFail, icon: "none" });
    }
  }

  if (!isLoggedIn()) {
    return (
      <PageShell title={t.title} subtitle={t.noPermission} ambient>
        <AuthBanner message={copy.settingsUi.authBanner} loginLabel={copy.loginUi.login} />
        <Button variant="primary" block onClick={() => requireAuth()} style={{ marginTop: "24rpx" }}>
          {copy.loginUi.login}
        </Button>
      </PageShell>
    );
  }

  return (
    <PageShell title={t.title} subtitle={t.subtitle} wide ambient>
      {dash && (
        <View className="tenant-stat">
          <Text className="tenant-stat__n">{dash.credit_pool}</Text>
          <Text className="typo-meta">{t.pool} · {dash.member_count} {t.members}</Text>
        </View>
      )}

      <SectionLabel>{t.embedBrand}</SectionLabel>
      <Input label={t.embedBrand} value={brand} onInput={(e) => setBrand(e.detail.value)} />
      <Input label={t.embedLogo} value={logoUrl} onInput={(e) => setLogoUrl(e.detail.value)} />
      <Input label={t.embedAccent} value={accent} onInput={(e) => setAccent(e.detail.value)} />
      <Button variant="primary" block onClick={saveEmbed}>
        {t.saveEmbed}
      </Button>

      <SectionLabel>{t.allocateCredits}</SectionLabel>
      <Input label={t.memberEmail} value={allocEmail} onInput={(e) => setAllocEmail(e.detail.value)} />
      <Input label={t.amount} value={allocAmount} onInput={(e) => setAllocAmount(e.detail.value)} />
      <Button variant="secondary" block onClick={allocate}>
        {t.allocateCredits}
      </Button>

      <SectionLabel>{t.members}</SectionLabel>
      {members.map((m) => (
        <Card key={m.email} flat className="tenant-member">
          <Text>{m.username}</Text>
          <Text className="typo-meta">{m.email} · {m.balance}</Text>
        </Card>
      ))}
    </PageShell>
  );
}
