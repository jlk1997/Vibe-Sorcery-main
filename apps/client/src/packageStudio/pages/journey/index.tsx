import { useState, useEffect, useMemo } from "react";
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import type { Waypoint } from "@vibe-sorcery/types";
import { emptyCreativeSpec, type MusicCreativeSpec, type SoundRecipeOptions } from "@vibe-sorcery/types";
import { PageShell, SectionLabel } from "../../../components/PageShell";
import { AvWaypointMap } from "../../../components/studio/AvWaypointMap";
import { WaypointTimeline } from "../../../components/studio/WaypointTimeline";
import { JourneyValuePreview } from "../../../components/studio/JourneyValuePreview";
import { CommercialAlertBanners } from "../../../components/commercial/CommercialAlertBanners";
import { AudioAnchorPanel } from "../../../components/studio/AudioAnchorPanel";
import { SoundRecipePanel } from "../../../components/studio/SoundRecipePanel";
import {
  Button,
  ChipGroup,
  Collapsible,
  CreditsPaywallSheet,
  CreditEstimateMeter,
  HeroPrompt,
  Icon,
  SegmentedControl,
  UsageMeter,
} from "../../../components/ui";
import { vibeApi, isInsufficientCredits } from "../../../services/api";
import { bootstrapAuth, requireAuth } from "../../../utils/auth";
import { useCreditsOptional } from "../../../contexts/CreditsProvider";
import { applyCreditsResponse, ensureSufficientCredits, taskCreditsGranted } from "../../../utils/creditsSync";
import type { EmotionAnalysis } from "../../../platform/upload";
import { pickAudioFile, uploadPlaylistForm } from "../../../platform/upload";
import { setItem, getItem, removeItem } from "../../../platform/storage";
import { isJourneyGuideCollapsed, setJourneyGuideCollapsed } from "../../../utils/onboarding";
import { buildPayloadSpec, STUDIO_CREATIVE_SPEC_KEY } from "../../../utils/creativeSpec";
import { CoachMarks } from "../../../components/onboarding/CoachMarks";
import { useStudioTabBarLayout } from "../../../hooks/useStudioTabBarLayout";
import "./index.scss";

const SCENE_CURVES = {
  tired: "calm_to_energy",
  low: "sad_to_hope",
  anxious: "chaos_to_order",
} as const;

type SceneId = keyof typeof SCENE_CURVES;
type JourneyTab = "preset" | "custom";

const SCENE_VISUAL: Record<SceneId, { emoji: string; emojiEnd: string; tone: "calm" | "hope" | "peace" }> = {
  tired: { emoji: "😴", emojiEnd: "😌", tone: "calm" },
  low: { emoji: "😔", emojiEnd: "🌤", tone: "hope" },
  anxious: { emoji: "😰", emojiEnd: "🧘", tone: "peace" },
};

type Scene = {
  id: SceneId;
  label: string;
  intent: string;
  title: string;
  curve: string;
};

function goBack() {
  Taro.navigateBack().catch(() => Taro.switchTab({ url: "/pages/create/index" }));
}

export default function JourneyPage() {
  const { copy, locale } = useLocale();
  useStudioTabBarLayout("packageStudio/pages/journey/index");
  const j = copy.journeyUi;
  const c = copy.createUi;
  const creditsCtx = useCreditsOptional();

  const scenes = useMemo<Scene[]>(
    () =>
      (Object.keys(SCENE_CURVES) as SceneId[]).map((id) => ({
        id,
        curve: SCENE_CURVES[id],
        label: j.scenes[id].label,
        intent: j.scenes[id].intent,
        title: j.scenes[id].title,
      })),
    [j.scenes]
  );

  const [tab, setTab] = useState<JourneyTab>("preset");
  const [selectedSceneId, setSelectedSceneId] = useState<SceneId>("tired");
  const [loading, setLoading] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [subscription, setSubscription] = useState<Awaited<ReturnType<typeof vibeApi.getSubscription>> | null>(null);
  const journeyCredits = 3;
  const [planning, setPlanning] = useState(false);
  const [customIntent, setCustomIntent] = useState("");
  const [waypoints, setWaypoints] = useState<Waypoint[]>([
    { step: 0, arousal: 3, valence: 4, description: j.waypointStart },
    { step: 1, arousal: 5, valence: 5.5, description: j.waypointTransition },
    { step: 2, arousal: 6, valence: 7, description: j.waypointEnd },
  ]);
  const [journeyTitle, setJourneyTitle] = useState(j.defaultTitle);
  const [targetCurve, setTargetCurve] = useState("calm_to_energy");
  const [musicParams, setMusicParams] = useState({
    bpm_range: [80, 120] as [number, number],
    key: "auto",
    duration_preference: "medium",
  });
  const [structureTemplates, setStructureTemplates] = useState<Array<{ id: string; label: string }>>([]);
  const [creativeSpec, setCreativeSpec] = useState<MusicCreativeSpec>(emptyCreativeSpec);
  const [soundRecipeOptions, setSoundRecipeOptions] = useState<SoundRecipeOptions | null>(null);
  const [keyOptions, setKeyOptions] = useState<string[]>(["auto"]);
  const [bpmPresets, setBpmPresets] = useState<Array<{ label: string; range: [number, number] }>>([]);
  const [guideExpanded, setGuideExpanded] = useState(() => !isJourneyGuideCollapsed());

  const selectedScene = scenes.find((s) => s.id === selectedSceneId) ?? scenes[0];

  useEffect(() => {
    bootstrapAuth();
    void creditsCtx?.refresh();
    vibeApi.getPlatformConfig().then((cfg) => {
      const s = cfg.studio;
      setMusicParams({
        bpm_range: s.default_bpm_range,
        key: s.default_key,
        duration_preference: s.default_duration,
      });
      if (s.sound_recipe) setSoundRecipeOptions(s.sound_recipe as SoundRecipeOptions);
      if (s.keys?.length) setKeyOptions(s.keys);
      if (s.bpm_presets?.length) setBpmPresets(s.bpm_presets);
    }).catch(() => {});
    const storedSpec = getItem(STUDIO_CREATIVE_SPEC_KEY);
    if (storedSpec) {
      try {
        setCreativeSpec({ ...emptyCreativeSpec(), ...JSON.parse(storedSpec) });
      } catch {
        /* ignore */
      }
    }
    const seedIntent = getItem("journey:seedIntent");
    if (seedIntent) {
      setCustomIntent(seedIntent);
      removeItem("journey:seedIntent");
    }
    vibeApi.getStructureTemplates().then(setStructureTemplates).catch(() => {});
    vibeApi.getSubscription().then(setSubscription).catch(() => setSubscription(null));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setItem(STUDIO_CREATIVE_SPEC_KEY, JSON.stringify(creativeSpec));
    }, 400);
    return () => clearTimeout(timer);
  }, [creativeSpec]);

  function journeyPayloadSpec(intent: string) {
    const spec = buildPayloadSpec(creativeSpec, intent, "");
    const mergedMusicParams = {
      ...musicParams,
      bpm_range: (spec.bpm_range as [number, number] | undefined) ?? musicParams.bpm_range,
      key: spec.key !== "auto" ? spec.key : musicParams.key,
    };
    return { spec, musicParams: mergedMusicParams };
  }

  function applyAnalysis(result: EmotionAnalysis) {
    if (result.arousal == null || result.valence == null) return;
    setWaypoints((prev) => {
      const next = [...prev];
      next[0] = {
        ...next[0],
        step: 0,
        arousal: result.arousal!,
        valence: result.valence!,
        description: result.moods?.[0] || j.audioAnchor,
      };
      return next;
    });
    if (result.moods?.length && !customIntent.trim()) {
      setCustomIntent(j.intentFromMoods.replace("{moods}", result.moods.slice(0, 2).join(locale === "zh" ? "、" : ", ")));
    }
  }

  function persistWaypoints() {
    setItem("journey:waypoints", JSON.stringify({ waypoints, journeyTitle, targetCurve, customIntent }));
  }

  async function applyStructure(templateId: string) {
    try {
      const res = await vibeApi.applyStructure(templateId, waypoints.length);
      setWaypoints(res.waypoints.map((w, i) => ({ ...w, step: i })));
    } catch {
      Taro.showToast({ title: j.planFail, icon: "none" });
    }
  }

  async function planFromText() {
    if (!customIntent.trim()) {
      Taro.showToast({ title: j.intentRequired, icon: "none" });
      return;
    }
    setPlanning(true);
    try {
      const plan = await vibeApi.planTextJourney(customIntent.trim(), waypoints.length);
      setJourneyTitle(plan.title);
      setTargetCurve(plan.target_curve);
      setWaypoints(plan.waypoints.map((w, i) => ({ ...w, step: i })));
      Taro.showToast({ title: j.planSuccess, icon: "success" });
    } catch {
      Taro.showToast({ title: j.planFail, icon: "none" });
    } finally {
      setPlanning(false);
    }
  }

  async function openPaywall() {
    await creditsCtx?.refresh();
    vibeApi
      .trackEvent("402_insufficient", {
        source: "journey",
        required: journeyCredits,
        balance: creditsCtx?.balance ?? 0,
      })
      .catch(() => {});
    setPaywallOpen(true);
  }

  async function generate(scene?: Scene) {
    if (!requireAuth()) return;
    if (!(await ensureSufficientCredits(creditsCtx, journeyCredits, openPaywall))) return;
    const intent = customIntent.trim() || scene?.intent || "";
    if (!intent && !scene) {
      Taro.showToast({ title: j.sceneOrIntentRequired, icon: "none" });
      return;
    }
    setLoading(true);
    persistWaypoints();
    vibeApi.trackEvent("journey_started", { scene: scene?.id || "custom" }).catch(() => {});
    try {
      const { spec: payloadSpec, musicParams: resolvedMusicParams } = journeyPayloadSpec(intent);
      const job = await vibeApi.generatePlaylistBody({
        text_intent: intent,
        title: scene?.title || journeyTitle,
        target_curve: scene?.curve || targetCurve,
        instrumental: true,
        steps: waypoints.length,
        waypoints,
        music_params: resolvedMusicParams,
        creative_spec: payloadSpec,
        moods: payloadSpec.moods,
        genres: payloadSpec.genres,
      });
      applyCreditsResponse(creditsCtx, job);
      Taro.navigateTo({ url: `/pages/playlist/index?jobId=${job.id}` });
    } catch (e) {
      if (isInsufficientCredits(e)) {
        openPaywall();
        return;
      }
      Taro.showToast({ title: e instanceof Error ? e.message : j.generateFail, icon: "none" });
    } finally {
      setLoading(false);
    }
  }

  async function generateFromAudio() {
    if (!requireAuth()) return;
    if (!(await ensureSufficientCredits(creditsCtx, journeyCredits, openPaywall))) return;
    try {
      const file = await pickAudioFile();
      setLoading(true);
      const intent = customIntent.trim();
      const { spec: payloadSpec, musicParams: resolvedMusicParams } = journeyPayloadSpec(intent);
      const fields: Record<string, string> = {
        generation_mode: "audio_anchor",
        steps: String(waypoints.length),
        target_curve: targetCurve,
        instrumental: "true",
        title: journeyTitle,
        waypoints_json: JSON.stringify(waypoints),
        bpm_min: String(resolvedMusicParams.bpm_range[0]),
        bpm_max: String(resolvedMusicParams.bpm_range[1]),
        key: resolvedMusicParams.key,
        duration_preference: resolvedMusicParams.duration_preference,
        creative_spec_json: JSON.stringify(payloadSpec),
      };
      if (intent) fields.text_intent = intent;
      let job: { id: string };
      if (typeof file === "string") {
        job = (await uploadPlaylistForm(file, fields)) as { id: string };
      } else {
        job = await vibeApi.generatePlaylist({
          file,
          steps: waypoints.length,
          targetCurve,
          generationMode: "audio_anchor",
          title: journeyTitle,
          waypoints,
          musicParams: resolvedMusicParams,
          textIntent: intent,
          creativeSpec: payloadSpec,
        });
      }
      vibeApi.trackEvent("journey_audio_upload", {}).catch(() => {});
      applyCreditsResponse(creditsCtx, job);
      Taro.navigateTo({ url: `/pages/playlist/index?jobId=${job.id}` });
    } catch (e) {
      if (isInsufficientCredits(e)) {
        openPaywall();
        return;
      }
      Taro.showToast({ title: e instanceof Error ? e.message : j.generateFail, icon: "none" });
    } finally {
      setLoading(false);
    }
  }

  function handleGenerate() {
    if (tab === "preset" && selectedScene) {
      void generate(selectedScene);
      return;
    }
    void generate();
  }

  const guideSteps = [
    { num: "1", label: j.step1Short },
    { num: "2", label: j.step2Short },
    { num: "3", label: j.step3Short },
  ];

  return (
    <PageShell title={copy.pages.journey.title} ambient immersive wide hideHeader noPadTop>
      <View className="journey-page">
        <CommercialAlertBanners subscription={subscription} />
        <View className="journey-header">
          <View className="journey-header__back" onClick={goBack}>
            <Icon name="chevronLeft" size="sm" accent />
            <Text className="journey-header__back-text">{copy.nav.studio}</Text>
          </View>
          <Text className="journey-header__title">{copy.pages.journey.title}</Text>
        </View>

        {guideExpanded ? (
          <View className="journey-guide">
            <View className="journey-guide__head">
              <Text className="journey-guide__title">{j.guideTitle}</Text>
              <Text
                className="journey-guide__toggle"
                onClick={() => {
                  setGuideExpanded(false);
                  setJourneyGuideCollapsed(true);
                }}
              >
                {j.guideCollapse}
              </Text>
            </View>
            <Text className="journey-guide__lead">{j.guideLead}</Text>
            <View className="journey-guide__steps">
              {guideSteps.map((step, i) => (
                <View key={step.num} className="journey-guide__step">
                  {i > 0 && <View className="journey-guide__step-line" />}
                  <View className="journey-guide__step-node">
                    <Text className="journey-guide__step-num">{step.num}</Text>
                  </View>
                  <Text className="journey-guide__step-label">{step.label}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <Text
            className="journey-guide__expand-link"
            onClick={() => {
              setGuideExpanded(true);
              setJourneyGuideCollapsed(false);
            }}
          >
            {j.guideExpand}
          </Text>
        )}

        {soundRecipeOptions && (
          <View className="journey-panel">
            <SectionLabel>{c.soundRecipe.title}</SectionLabel>
            <Text className="journey-hint">{j.soundRecipeHint}</Text>
            <SoundRecipePanel
              spec={creativeSpec}
              options={soundRecipeOptions}
              keyOptions={keyOptions}
              bpmPresets={bpmPresets}
              onChange={(next) => setCreativeSpec({ ...next, custom_prompt_override: "" })}
            />
          </View>
        )}

        <SegmentedControl
          className="journey-tabs"
          value={tab}
          onChange={setTab}
          options={[
            { value: "preset", label: j.tabPreset },
            { value: "custom", label: j.tabCustom },
          ]}
        />

        {tab === "preset" && (
          <View className="journey-panel">
            <SectionLabel>{j.presetLabel}</SectionLabel>
            <Text className="journey-hint">{j.presetHint}</Text>
            <View className="journey-presets">
              {scenes.map((s) => {
                const vis = SCENE_VISUAL[s.id];
                const active = selectedSceneId === s.id;
                return (
                  <View
                    key={s.id}
                    className={`journey-preset ${active ? "journey-preset--active" : ""} journey-preset--${vis.tone}`}
                    onClick={() => setSelectedSceneId(s.id)}
                  >
                    <View className="journey-preset__emojis">
                      <Text>{vis.emoji}</Text>
                      <View className="journey-preset__arrow" />
                      <Text>{vis.emojiEnd}</Text>
                    </View>
                    <Text className="journey-preset__label">{s.label}</Text>
                  </View>
                );
              })}
            </View>

            {selectedScene && (
              <View className={`journey-detail journey-detail--${SCENE_VISUAL[selectedScene.id].tone}`}>
                <View className="journey-detail__visual">
                  <Text className="journey-detail__emoji">{SCENE_VISUAL[selectedScene.id].emoji}</Text>
                  <View className="journey-detail__arc">
                    <View className="journey-detail__arc-dot journey-detail__arc-dot--start" />
                    <View className="journey-detail__arc-line" />
                    <View className="journey-detail__arc-dot journey-detail__arc-dot--end" />
                  </View>
                  <Text className="journey-detail__emoji">{SCENE_VISUAL[selectedScene.id].emojiEnd}</Text>
                </View>
                <Text className="journey-detail__title">{selectedScene.label}</Text>
                <Text className="journey-detail__desc">{selectedScene.intent}</Text>
              </View>
            )}
          </View>
        )}

        {tab === "custom" && (
          <View className="journey-panel">
            <SectionLabel>{j.intentLabel}</SectionLabel>
            <Text className="journey-hint">{j.intentHint}</Text>
            <HeroPrompt
              variant="ritual"
              value={customIntent}
              placeholder={j.intentPlaceholder}
              onInput={setCustomIntent}
              maxlength={200}
            />
            <Button variant="secondary" size="sm" loading={planning} onClick={planFromText}>
              {j.planWaypoints}
            </Button>

            <SectionLabel>{j.waypointPreview}</SectionLabel>
            <WaypointTimeline waypoints={waypoints} />

            <Collapsible label={`${j.advancedPrefix} · ${j.mapSectionTitle}`} storageKey="journey-advanced">
              {structureTemplates.length > 0 && (
                <>
                  <SectionLabel>{c.structureLabel}</SectionLabel>
                  <ChipGroup
                    options={structureTemplates.map((t) => ({ value: t.id, label: t.label }))}
                    value=""
                    onChange={(id) => applyStructure(id)}
                  />
                </>
              )}
              <AudioAnchorPanel onAnalysis={applyAnalysis} />
              <Button variant="secondary" size="sm" loading={loading} onClick={generateFromAudio} style={{ marginTop: "16rpx" }}>
                {j.audioAnchor}
              </Button>
              <AvWaypointMap waypoints={waypoints} onChange={setWaypoints} />
            </Collapsible>
          </View>
        )}

        <JourneyValuePreview waypoints={waypoints} trackCount={waypoints.length} />

        <View className="journey-dock">
          <View className="journey-dock__glow" />
          <View className="journey-dock__inner">
            <CreditEstimateMeter mode="playlist" onCreditsChange={() => {}} />
            <Button variant="primary" block loading={loading} onClick={handleGenerate}>
              {j.generateWithCredits.replace("{n}", String(journeyCredits))}
            </Button>
          </View>
        </View>

        <CoachMarks page="journey" />
      </View>

      <CreditsPaywallSheet
        open={paywallOpen}
        requiredCredits={journeyCredits}
        source="journey"
        returnPath="/packageStudio/pages/journey/index"
        onClose={() => setPaywallOpen(false)}
        onSuccess={() => {
          setPaywallOpen(false);
          void handleGenerate();
        }}
      />
    </PageShell>
  );
}
