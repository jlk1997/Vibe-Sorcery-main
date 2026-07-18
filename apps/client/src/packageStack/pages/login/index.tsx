import { useEffect, useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { PageShell } from "../../../components/PageShell";
import { Button, Card, FeatureCard, ImmersiveCover, Input } from "../../../components/ui";
import { loginWithEmail, registerWithEmail, loginWithWechat } from "../../../platform/auth";
import { getItem, setItem } from "../../../platform/storage";
import { ConsentCheckbox } from "../../../components/legal/ConsentCheckbox";
import { LegalFooter } from "../../../components/legal/LegalFooter";
import { BrandLogo } from "../../../components/brand/BrandLogo";
import { LEGAL_ROUTES } from "../../../utils/legal";
import { getRequiredVersions } from "../../../utils/consent";
import { isLoggedIn } from "../../../utils/auth";
import { navigateAfterLogin, showAuthSuccessAndLeave } from "../../../utils/loginNavigation";
import "./index.scss";

const EMAIL_KEY = "auth:lastEmail";

export default function LoginPage() {
  const router = useRouter();
  const { copy } = useLocale();
  const l = copy.loginUi;
  const p = copy.profileUi;
  const next = router.params.next;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [legalVersions, setLegalVersions] = useState({ terms: "2026-07-08", privacy: "2026-07-08" });

  useEffect(() => {
    getRequiredVersions().then((v) =>
      setLegalVersions({ terms: v.terms || "2026-07-08", privacy: v.privacy || "2026-07-08" }),
    );
  }, []);

  useEffect(() => {
    const saved = getItem(EMAIL_KEY);
    if (saved) setEmail(saved);
    const ref = router.params.ref;
    if (ref) {
      setReferralCode(ref.toUpperCase());
      setIsRegister(true);
    }
  }, [router.params.ref]);

  useDidShow(() => {
    if (isLoggedIn()) navigateAfterLogin(next);
  });

  function persistEmail(value: string) {
    const trimmed = value.trim().toLowerCase();
    if (trimmed) setItem(EMAIL_KEY, trimmed);
  }

  async function submitLogin() {
    setLoading(true);
    try {
      const addr = email.trim().toLowerCase();
      await loginWithEmail(addr, password);
      persistEmail(addr);
      showAuthSuccessAndLeave(l.loginSuccess, next);
    } catch (err) {
      console.error("[login] email login failed:", err);
      Taro.showToast({ title: l.loginFail, icon: "none" });
    } finally {
      setLoading(false);
    }
  }

  async function submitRegister() {
    if (!agreed) {
      Taro.showToast({ title: copy.legalUi.mustAgree, icon: "none" });
      return;
    }
    setLoading(true);
    try {
      const addr = email.trim().toLowerCase();
      await registerWithEmail(
        addr,
        username.trim(),
        password,
        referralCode.trim() || undefined,
        legalVersions.terms,
        legalVersions.privacy,
      );
      persistEmail(addr);
      showAuthSuccessAndLeave(l.registerSuccess, next);
    } catch (err) {
      console.error("[login] register failed:", err);
      Taro.showToast({ title: l.registerFail, icon: "none" });
    } finally {
      setLoading(false);
    }
  }

  async function wechat() {
    if (process.env.TARO_ENV !== "weapp") {
      Taro.showToast({ title: l.wechatOnly, icon: "none" });
      return;
    }
    if (!agreed) {
      Taro.showToast({ title: copy.legalUi.mustAgree, icon: "none" });
      return;
    }
    setLoading(true);
    try {
      await loginWithWechat(legalVersions.terms, legalVersions.privacy);
      showAuthSuccessAndLeave(l.wechatSuccess, next);
    } catch (err) {
      console.error("[login] wechat login failed:", err);
      Taro.showToast({ title: l.wechatFail, icon: "none" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell label={copy.navGroups.account} title={isRegister ? l.register : l.login} subtitle={l.subtitle} hideHeader noPadTop showCredits={false} wide ambient ambientVariant="warm">
      <View className="login-page">
        <ImmersiveCover height="200rpx">
          <View className="login-hero">
            <View className="login-hero__orb">
              <BrandLogo variant="icon" size="lg" showName={false} />
            </View>
            <Text className="login-hero__logo">{copy.brand.name}</Text>
            <Text className="login-hero__tagline">{copy.brand.tagline}</Text>
            <Text className="login-hero__hint">{l.subtitle}</Text>
          </View>
        </ImmersiveCover>

        <View className="login-features">
          <FeatureCard icon="music" title={p.featureCreate} description={p.bullet1} />
          <FeatureCard icon="journey" title={p.featureJourney} description={p.bullet2} />
          <FeatureCard icon="feed" title={p.featureCommunity} description={p.bullet3} />
        </View>

        <Card flat className="login-form">
          {process.env.TARO_ENV === "weapp" && (
            <Button variant="primary" block loading={loading} onClick={wechat} className="login-wechat">
              {l.wechatLogin}
            </Button>
          )}
          <Input label={l.email} placeholder="you@example.com" value={email} onInput={(e) => setEmail(e.detail.value)} />
          {isRegister && (
            <Input label={l.username} placeholder={l.username} value={username} onInput={(e) => setUsername(e.detail.value)} />
          )}
          {isRegister && (
            <Input
              label={l.referralCode}
              placeholder={l.referralCode}
              value={referralCode}
              onInput={(e) => setReferralCode(e.detail.value.toUpperCase())}
            />
          )}
          <Input label={l.password} password placeholder={l.password} value={password} onInput={(e) => setPassword(e.detail.value)} />
          {(isRegister || process.env.TARO_ENV === "weapp") && (
            <ConsentCheckbox
              checked={agreed}
              onChange={setAgreed}
              links={[
                { label: `《${copy.legalUi.termsOfService}》`, route: LEGAL_ROUTES.terms },
                { label: `《${copy.legalUi.privacyPolicy}》`, route: LEGAL_ROUTES.privacy },
              ]}
            >
              {copy.legalUi.agreeTermsAndPrivacy
                .replace(`《${copy.legalUi.termsOfService}》`, "")
                .replace(`《${copy.legalUi.privacyPolicy}》`, "")
                .replace("和", "")}
            </ConsentCheckbox>
          )}
          <Button variant="primary" block loading={loading} onClick={isRegister ? submitRegister : submitLogin}>
            {isRegister ? l.register : l.login}
          </Button>
        </Card>

        <Text className="login-toggle" onClick={() => setIsRegister(!isRegister)}>
          {isRegister ? l.hasAccount : l.noAccount}
        </Text>
        <LegalFooter />
      </View>
    </PageShell>
  );
}
