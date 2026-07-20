import { useState, lazy, Suspense, useRef } from "react";
import { View, Text, ScrollView } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import type { CreateMode, StudioAction } from "@vibe-sorcery/types";
import { PageShell } from "../../../components/PageShell";
import { AuthBanner, Button, ChatBubble, EmptyState, Icon, TextArea, Badge } from "../../../components/ui";
import { vibeApi } from "../../../services/api";
import { bootstrapAuth, isLoggedIn, requireAuth } from "../../../utils/auth";
import { applyStudioActions } from "../../../utils/studioBridge";
import { openCopilotStudioFallback, startCopilotGeneration } from "../../../utils/copilotGenerate";
import { useCreditsOptional } from "../../../contexts/CreditsProvider";
import { trackActivation } from "../../../utils/activationEvents";
import { STACK_PAGE_ROUTES } from "../../../constants/routes";
import { CopilotActionPanel } from "../../components/CopilotActionPanel";
import "./index.scss";

const LazyGenerationProgress = lazy(() =>
  import("../../../components/studio/GenerationProgress").then((m) => ({ default: m.GenerationProgress }))
);

type Msg = { role: "user" | "assistant"; content: string; navigate?: string; actions?: StudioAction[] };

export default function CopilotPage() {
  const { copy } = useLocale();
  const cp = copy.copilotUi;
  const creditsCtx = useCreditsOptional();

  function actionLabel(action: StudioAction): string {
    if (action.type === "start_generation" && action.estimate?.cost != null) {
      return cp.actionGenerate.replace("{n}", String(action.estimate.cost));
    }
    if (action.type === "prefill_journey") return cp.actionJourney;
    if (action.type === "prefill_create" || action.type === "navigate") return cp.actionPrefill;
    return cp.applyStudio;
  }
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [sessions, setSessions] = useState<Array<{ id: string; title?: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [pricingLink, setPricingLink] = useState<string | null>(null);
  const [pendingActions, setPendingActions] = useState<StudioAction[] | null>(null);
  const [sessionContext, setSessionContext] = useState<Record<string, unknown>>({});
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJobMode, setActiveJobMode] = useState<CreateMode>("quickTrack");
  const [generating, setGenerating] = useState(false);
  const generateLatchRef = useRef(false);
  const [scrollIntoView, setScrollIntoView] = useState("");
  const [copilotUsage, setCopilotUsage] = useState<{
    is_member: boolean;
    daily_limit: number | null;
    daily_used: number;
    daily_remaining: number | null;
  } | null>(null);

  function startNewChat() {
    setSessionId(undefined);
    setMessages([]);
    setSessionContext({});
    setPendingActions(null);
    setPricingLink(null);
  }

  function bumpScroll() {
    setScrollIntoView(`copilot-msg-${Date.now()}`);
  }

  function contextChips(ctx: Record<string, unknown>): string[] {
    const chips: string[] = [];
    const preset = ctx.last_preset as { preset_id?: string } | undefined;
    const journey = ctx.last_journey as { title?: string } | undefined;
    if (preset?.preset_id) chips.push(cp.contextPreset.replace("{id}", preset.preset_id));
    if (journey?.title) chips.push(cp.contextJourney.replace("{title}", journey.title));
    return chips;
  }

  const activeContextChips = contextChips(sessionContext);

  const prompts = [cp.promptJourney, cp.promptCredits, cp.promptRemix];

  useDidShow(() => {
    bootstrapAuth();
    if (!isLoggedIn()) return;
    vibeApi.copilotListSessions().then(setSessions).catch(() => {});
    vibeApi.copilotUsage().then(setCopilotUsage).catch(() => {});
  });

  async function handleStudioActions(actions: StudioAction[], inlineGenerate: boolean) {
    const startAction = actions.find((a) => a.type === "start_generation");
    if (inlineGenerate && startAction) {
      if (generating || activeJobId || generateLatchRef.current) return;
      const cost = startAction.estimate?.cost ?? 1;
      const confirmed = await new Promise<boolean>((resolve) => {
        Taro.showModal({
          title: cp.generateConfirmTitle,
          content: cp.generateConfirmBody.replace("{n}", String(cost)),
          confirmText: cp.generateConfirmOk,
          cancelText: cp.generateConfirmStudio,
          success: (res) => resolve(!!res.confirm),
        });
      });
      if (!confirmed) {
        openCopilotStudioFallback(actions);
        return;
      }
      setGenerating(true);
      generateLatchRef.current = true;
      setActiveJobId(null);
      try {
        const result = await startCopilotGeneration(actions, creditsCtx, () => {
          Taro.navigateTo({ url: STACK_PAGE_ROUTES.pricing });
        });
        if (result) {
          setActiveJobId(result.jobId);
          setActiveJobMode(result.mode);
          trackActivation("activation_first_generate_start", { mode: result.mode, source: "copilot" });
          Taro.showToast({ title: cp.generateStarted, icon: "success" });
        }
      } catch {
        Taro.showToast({ title: cp.unavailable, icon: "none" });
      } finally {
        generateLatchRef.current = false;
        setGenerating(false);
      }
      return;
    }
    applyStudioActions(actions);
  }

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || !requireAuth()) return;
    setInput("");
    setPricingLink(null);
    setPendingActions(null);
    setMessages((m) => [...m, { role: "user", content: text }]);
    bumpScroll();
    setLoading(true);
    let assistantIdx = -1;
    try {
      const useStream = process.env.TARO_ENV === "h5" && typeof ReadableStream !== "undefined";
      if (useStream) {
        setMessages((m) => {
          assistantIdx = m.length;
          return [...m, { role: "assistant", content: "" }];
        });
        const res = await vibeApi.copilotChatStream(text, sessionId, (delta) => {
          setMessages((m) => {
            const next = [...m];
            const idx = assistantIdx >= 0 ? assistantIdx : next.length - 1;
            if (next[idx]?.role === "assistant") {
              next[idx] = { ...next[idx], content: (next[idx].content || "") + delta };
            }
            return next;
          });
        });
        setSessionId(res.session_id);
        const actions = (res.actions || []) as StudioAction[];
        setMessages((m) => {
          const next = [...m];
          const idx = assistantIdx >= 0 ? assistantIdx : next.length - 1;
          if (next[idx]) next[idx] = { ...next[idx], content: res.reply, actions };
          return next;
        });
        if (actions.length) setPendingActions(actions);
        if (res.tool_result?.navigate) setPricingLink(String(res.tool_result.navigate));
        void vibeApi.copilotGetSession(res.session_id).then((s) => setSessionContext(s.context || {})).catch(() => {});
      } else {
        const res = await vibeApi.copilotChat(text, sessionId);
        setSessionId(res.session_id);
        const actions = (res.actions || []) as StudioAction[];
        setMessages((m) => [...m, { role: "assistant", content: res.reply, actions }]);
        if (actions.length) setPendingActions(actions);
        if (res.tool_result?.navigate) setPricingLink(String(res.tool_result.navigate));
        void vibeApi.copilotGetSession(res.session_id).then((s) => setSessionContext(s.context || {})).catch(() => {});
      }
    } catch {
      Taro.showToast({ title: cp.unavailable, icon: "none" });
    } finally {
      setLoading(false);
      bumpScroll();
      void vibeApi.copilotUsage().then(setCopilotUsage).catch(() => {});
    }
  }

  async function loadSession(id: string) {
    try {
      const s = await vibeApi.copilotGetSession(id);
      setSessionId(s.id);
      setSessionContext(s.context || {});
      setMessages(
        s.messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
          actions: (m.actions as StudioAction[] | undefined) || undefined,
        }))
      );
    } catch {
      Taro.showToast({ title: cp.unavailable, icon: "none" });
    }
  }

  async function deleteSession(id: string) {
    try {
      await vibeApi.copilotDeleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (sessionId === id) {
        setSessionId(undefined);
        setMessages([]);
        setSessionContext({});
      }
      Taro.showToast({ title: cp.sessionDeleted, icon: "success" });
    } catch {
      Taro.showToast({ title: cp.unavailable, icon: "none" });
    }
  }

  if (!isLoggedIn()) {
    return (
      <PageShell title={cp.title} subtitle={cp.loginSubtitle} immersive ambient>
        <EmptyState iconName="create" title={cp.title} description={cp.loginSubtitle} actionLabel={copy.loginUi.login} onAction={() => requireAuth()} />
      </PageShell>
    );
  }

  return (
    <PageShell title={cp.title} subtitle={cp.subtitle} ambient noPadTop immersive wide>
      <View className="copilot-page">
      <View className="copilot-header">
        <View className="copilot-header__brand">
          <View className="copilot-header__orb">
            <Text className="copilot-header__sigil">☿</Text>
          </View>
          <View>
            <Text className="copilot-header__label">{cp.title}</Text>
            {creditsCtx?.balance != null && (
              <Text className="copilot-header__credits">{cp.creditsChip.replace("{n}", String(creditsCtx.balance))}</Text>
            )}
            {creditsCtx?.isMember ? (
              <Badge tone="accent">{cp.proBadge}</Badge>
            ) : copilotUsage?.daily_remaining != null && copilotUsage.daily_limit != null ? (
              <Text className="copilot-header__limit">
                {cp.dailyUsage
                  .replace("{n}", String(copilotUsage.daily_remaining))
                  .replace("{limit}", String(copilotUsage.daily_limit))}
              </Text>
            ) : (
              <Text className="copilot-header__limit">{cp.freeLimitHint}</Text>
            )}
          </View>
        </View>
        <View className="copilot-header__actions">
          <Text className="copilot-header__action" onClick={startNewChat}>
            {cp.newChat}
          </Text>
        </View>
      </View>

      {sessions.length > 0 && (
        <ScrollView scrollX className="copilot-sessions">
          <View className="copilot-sessions__row">
            {sessions.slice(0, 8).map((s) => (
              <View key={s.id} className={sessionId === s.id ? "copilot-session copilot-session--active" : "copilot-session"}>
                <Text className="copilot-session__chip" onClick={() => loadSession(s.id)}>
                  {s.title || s.id.slice(0, 8)}
                </Text>
                <Text className="copilot-session__delete" onClick={() => deleteSession(s.id)}>
                  ×
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {activeContextChips.length > 0 && (
        <View className="copilot-context">
          {activeContextChips.map((chip) => (
            <Text key={chip} className="copilot-context__chip">
              {chip}
            </Text>
          ))}
        </View>
      )}

      <ScrollView scrollY className="copilot-scroll" scrollIntoView={scrollIntoView} scrollWithAnimation>
        {messages.length === 0 && (
          <View className="copilot-empty-wrap">
            <View className="copilot-empty-hero">
              <Icon name="sigil" accent size="lg" />
              <Text className="copilot-empty-hero__title">{cp.emptyTitle}</Text>
              <Text className="copilot-empty-hero__hint">{cp.emptyHint}</Text>
            </View>
            <Text className="copilot-prompts-label">{cp.promptsLabel}</Text>
            <View className="copilot-prompts">
              {prompts.map((p) => (
                <Text key={p} className="copilot-prompt" onClick={() => send(p)}>
                  {p}
                </Text>
              ))}
            </View>
          </View>
        )}
        {messages.map((m, i) => (
          <View key={i} id={`copilot-msg-${i}`}>
            <ChatBubble role={m.role} content={m.content || (loading && m.role === "assistant" ? cp.typing : "")} />
            {m.role === "assistant" && m.actions && m.actions.length > 0 && (
              m.actions.some((a) => a.type === "start_generation") ? (
                <CopilotActionPanel
                  actions={m.actions}
                  variant="generate"
                  generating={generating}
                  primaryLabel={actionLabel(m.actions.find((a) => a.type === "start_generation")!)}
                  secondaryLabel={cp.openInStudio}
                  onPrimary={() => handleStudioActions(m.actions!, true)}
                  onSecondary={() => handleStudioActions(m.actions!, false)}
                />
              ) : (
                <CopilotActionPanel
                  actions={m.actions}
                  variant="studio"
                  primaryLabel={cp.applyStudio}
                  onPrimary={() => applyStudioActions(m.actions!)}
                />
              )
            )}
          </View>
        ))}
        {loading && (
          <View className="copilot-typing">
            <Icon name="sigil" accent size="sm" />
            <Text>{cp.typing}</Text>
          </View>
        )}
        {pricingLink && (
          <View className="copilot-pricing-cta">
            <Button variant="secondary" size="sm" onClick={() => Taro.navigateTo({ url: pricingLink })}>
              {cp.viewPricing}
            </Button>
          </View>
        )}
        {pendingActions && pendingActions.length > 0 && (
          pendingActions.some((a) => a.type === "start_generation") ? (
            <CopilotActionPanel
              actions={pendingActions}
              variant="generate"
              generating={generating}
              primaryLabel={actionLabel(pendingActions.find((a) => a.type === "start_generation")!)}
              secondaryLabel={cp.openInStudio}
              onPrimary={() => {
                void handleStudioActions(pendingActions, true);
                setPendingActions(null);
              }}
              onSecondary={() => {
                void handleStudioActions(pendingActions, false);
                setPendingActions(null);
              }}
            />
          ) : (
            <CopilotActionPanel
              actions={pendingActions}
              variant="studio"
              primaryLabel={cp.applyStudio}
              onPrimary={() => {
                applyStudioActions(pendingActions);
                setPendingActions(null);
              }}
            />
          )
        )}
        {activeJobId && (
          <View className="copilot-job-progress">
            <View className="copilot-job-progress__head">
              <Icon name="create" accent size="sm" />
              <Text className="copilot-job-progress__title">{cp.generatingTitle}</Text>
            </View>
            <Suspense fallback={<Text className="copilot-typing">{cp.generating}</Text>}>
              <LazyGenerationProgress
                jobId={activeJobId}
                jobType={activeJobMode === "playlist" ? "playlist" : "single"}
                returnUrl="/packageCopilot/pages/copilot/index"
                showActions
              />
            </Suspense>
          </View>
        )}
      </ScrollView>

      <View className="copilot-input-row">
        <TextArea className="copilot-input" value={input} onInput={(e) => setInput(e.detail.value)} placeholder={cp.placeholder} maxlength={500} />
        <Button variant="primary" loading={loading} disabled={!input.trim()} onClick={() => send()}>
          {cp.send}
        </Button>
      </View>
      </View>
    </PageShell>
  );
}
