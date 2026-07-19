import { useState, useEffect, useMemo, useRef, lazy, Suspense } from "react";
import { Text, View } from "@tarojs/components";
import Taro, { useRouter, useDidShow } from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { PageShell, SectionLabel } from "../../components/PageShell";
import { CreateModePicker, type CreateMode } from "../../components/studio/CreateModePicker";
import { CreateFormulaPanel } from "../../components/studio/CreateFormulaPanel";
import { PromptPreviewBar } from "../../components/studio/PromptPreviewBar";
import { ReferenceTrackPicker } from "../../components/studio/ReferenceTrackPicker";
import { WorkTitleSheet } from "../../components/studio/WorkTitleSheet";
import {
  Button,
  BottomSheet,
  ModeTileGrid,
  LoadingSkeleton,
  TextArea,
  Icon,
  showSuccess,
  showError,
  CreditEstimateMeter,
  type ModeTileItem,
  StepRail,
} from "../../components/ui";
import { vibeApi, isInsufficientCredits, isRemixForbidden, generateIdempotencyKey, isActiveJobLimit, isRateLimited, isQueueOverload, getRateLimitRetryAfter } from "../../services/api";
import { bootstrapAuth, requireAuth, isLoggedIn } from "../../utils/auth";
import { useCreditsOptional } from "../../contexts/CreditsProvider";
import { useActiveJobOptional } from "../../contexts/ActiveJobProvider";
import { useTheme } from "../../contexts/ThemeProvider";
import { getItem, removeItem, setItem } from "../../platform/storage";
import { requestGenerationSubscribeMessages } from "../../platform/wechatSubscribe";
import { CommercialAlertBanners } from "../../components/commercial/CommercialAlertBanners";
import { applyCreditsResponse, ensureSufficientCredits, taskCreditsGranted, type CreditsApiPayload } from "../../utils/creditsSync";
import type { RemixSourceSnapshot } from "../../utils/generationStorage";
import { clearActiveGeneration } from "../../utils/generationStorage";
import { openStackPage } from "../../utils/navigation";
import { STACK_PAGE_ROUTES, STUDIO_PAGE_ROUTES } from "../../constants/routes";
import { openWorkDetail } from "../../utils/workNav";
import { trackActivation, trackActivationOnce } from "../../utils/activationEvents";
import { useServerDraftSync } from "../../hooks/useServerDraftSync";
import { persistActiveGeneration, resolveRestorableJobId } from "../../utils/restoreGeneration";
import { isTerminalJobStatus } from "../../utils/generationPhases";
import { CoachMarks } from "../../components/onboarding/CoachMarks";
import { AiDisclaimerSheet } from "../../components/legal/AiDisclaimerSheet";
import { fetchConsentStatus, ensureAiNoticeConsent } from "../../utils/consent";
import { resolveWorkTitle } from "../../utils/workTitle";
import { emptyCreativeSpec, type MusicCreativeSpec, type SoundRecipeOptions } from "@vibe-sorcery/types";
import {
  buildPayloadSpec,
  hasCreativeConstraints,
  mergeParsedSpec,
  mergePresetApplied,
  STUDIO_CREATIVE_SPEC_KEY,
} from "../../utils/creativeSpec";

import { GenerationProgress } from "../../components/studio/GenerationProgress";

import "./index.scss";
import "../../styles/tab-page.scss";

import type { StylePreset } from "../../components/studio/PresetCarousel";

const PresetCarousel = lazy(() =>
  import("../../components/studio/PresetCarousel").then((m) => ({ default: m.PresetCarousel }))
);
const SoundRecipePanel = lazy(() =>
  import("../../components/studio/SoundRecipePanel").then((m) => ({ default: m.SoundRecipePanel }))
);
const EmotionDiagnosisCard = lazy(() =>
  import("../../components/studio/EmotionDiagnosisCard").then((m) => ({ default: m.EmotionDiagnosisCard }))
);
const RemixFlowPanel = lazy(() =>
  import("../../components/studio/RemixFlowPanel").then((m) => ({ default: m.RemixFlowPanel }))
);
const WorkPicker = lazy(() =>
  import("../../components/studio/WorkPicker").then((m) => ({ default: m.WorkPicker }))
);

const CreditsPaywallSheet = lazy(() =>
  import("../../components/ui/CreditsPaywallSheet").then((m) => ({ default: m.CreditsPaywallSheet }))
);
const LazyEngagementPanel = lazy(() =>
  import("../../components/engagement/EngagementPanel").then((m) => ({ default: m.EngagementPanel }))
);

function shouldPromptWorkTitle(mode: CreateMode, coverStep: "pick" | "preprocess" | "generate") {
  if (mode === "quickTrack" || mode === "playlist" || mode === "lyrics" || mode === "variation" || mode === "remix") return true;
  if (mode === "cover" && coverStep === "generate") return true;
  return false;
}

export default function CreatePage() {
  const router = useRouter();
  const { copy, locale } = useLocale();
  const c = copy.createUi;
  const modes = copy.studioSummary.modes;
  const creditsCtx = useCreditsOptional();
  const activeJobCtx = useActiveJobOptional();
  const [mode, setMode] = useState<CreateMode>("quickTrack");
  const [presets, setPresets] = useState<StylePreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [textIntent, setTextIntent] = useState(c.defaultIntent);
  const [diagnosisOpen, setDiagnosisOpen] = useState(true);
  const [diagnosisSummary, setDiagnosisSummary] = useState("");
  const [workTitle, setWorkTitle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [lyricsStyleTags, setLyricsStyleTags] = useState("");
  const [seedWorkId, setSeedWorkId] = useState("");
  const [seedWorkTitle, setSeedWorkTitle] = useState("");
  const [seedRemixAllowed, setSeedRemixAllowed] = useState(true);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJobType, setActiveJobType] = useState<"single" | "playlist" | "variations" | "remix">("single");
  const [activeJobStartedAt, setActiveJobStartedAt] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [generatingLyrics, setGeneratingLyrics] = useState(false);
  const [polishingIntent, setPolishingIntent] = useState(false);
  const [titleSheetOpen, setTitleSheetOpen] = useState(false);
  const [aiDisclaimerOpen, setAiDisclaimerOpen] = useState(false);
  const [aiConsentLoading, setAiConsentLoading] = useState(false);
  const pendingGenerateTitleRef = useRef<string | undefined>(undefined);
  const [titleDraft, setTitleDraft] = useState("");
  const [coverStep, setCoverStep] = useState<"pick" | "preprocess" | "generate">("pick");
  const [coverLyrics, setCoverLyrics] = useState("");
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [moreModesOpen, setMoreModesOpen] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [drafts, setDrafts] = useState<
    Array<{ id: string; title: string; mode: string; payload: Record<string, unknown>; version?: number }>
  >([]);
  const generateLatchRef = useRef(false);
  const { setMood } = useTheme();
  const credits = creditsCtx?.balance ?? null;
  const gateEnabled = creditsCtx?.gateEnabled ?? false;
  const creditsReady = creditsCtx?.ready ?? false;
  const creditsBlocked = gateEnabled && (!creditsReady || credits == null || credits < creditCost);
  const [worksCount, setWorksCount] = useState(0);
  const [recentWork, setRecentWork] = useState<{ id: string; title: string } | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallCredits, setPaywallCredits] = useState(1);
  const [paywallSource, setPaywallSource] = useState("create_dock");
  const [coachOpen, setCoachOpen] = useState(false);
  const [paywallTab, setPaywallTab] = useState<"member" | "pack">("pack");
  const [subscription, setSubscription] = useState<Awaited<ReturnType<typeof vibeApi.getSubscription>> | null>(null);
  const [estimatedCredits, setEstimatedCredits] = useState(1);
  const [activeRemixSource, setActiveRemixSource] = useState<RemixSourceSnapshot | null>(null);
  const [referenceWorkId, setReferenceWorkId] = useState<string | null>(null);
  const [referenceAvOffset, setReferenceAvOffset] = useState<{ arousal: number; valence: number }>({ arousal: 0, valence: 0 });
  const [pickerWorks, setPickerWorks] = useState<Array<{ id: string; title: string; cover_url?: string }>>([]);
  const [creativeSpec, setCreativeSpec] = useState<MusicCreativeSpec>(emptyCreativeSpec);
  const [soundRecipeOptions, setSoundRecipeOptions] = useState<SoundRecipeOptions | null>(null);
  const [keyOptions, setKeyOptions] = useState<string[]>(["auto"]);
  const [bpmPresets, setBpmPresets] = useState<Array<{ label: string; range: [number, number] }>>([]);

  const titleSuggestOpts = useMemo(
    () => ({ spec: creativeSpec, soundRecipe: soundRecipeOptions, locale }),
    [creativeSpec, soundRecipeOptions, locale],
  );

  const estimateMode = useMemo(() => {
    if (mode === "quickTrack") return "single";
    if (mode === "playlist") return "playlist";
    if (mode === "variation") return "variation";
    return mode;
  }, [mode]);

  const creditCost = estimatedCredits;

  const deckSteps = useMemo(
    () =>
      mode === "remix"
        ? [
            { num: "1", label: c.remixFlow.stepSource },
            { num: "2", label: c.remixFlow.stepIntent },
            { num: "3", label: c.remixFlow.stepGo },
          ]
        : [
            { num: "1", label: c.homeDeckStep1 },
            { num: "2", label: c.homeDeckStep2 },
            { num: "3", label: c.homeDeckStep3 },
          ],
    [mode, c.homeDeckStep1, c.homeDeckStep2, c.homeDeckStep3, c.remixFlow.stepSource, c.remixFlow.stepIntent, c.remixFlow.stepGo]
  );

  const remixReady = mode !== "remix" || (!!seedWorkId && textIntent.trim().length >= 3 && seedRemixAllowed);

  const jobBlocking = useMemo(() => {
    if (!activeJobId) return false;
    const ctxJob = activeJobCtx?.job;
    if (ctxJob?.jobId === activeJobId) {
      return !isTerminalJobStatus(ctxJob.status);
    }
    // Context cleared after completion — result card still visible, dock should unlock.
    if (!ctxJob) return false;
    return true;
  }, [activeJobId, activeJobCtx?.job]);

  useServerDraftSync(
    isLoggedIn() && !activeJobId,
    mode,
    { textIntent, lyrics, lyricsStyleTags, seedWorkId, selectedPresetId, referenceWorkId, referenceAvOffset, creativeSpec },
    textIntent.slice(0, 40) || workTitle || "Draft",
    (draft) => {
      const p = draft.payload || {};
      if (typeof p.textIntent === "string") setTextIntent(p.textIntent);
      if (typeof p.lyrics === "string") setLyrics(p.lyrics);
      if (typeof p.lyricsStyleTags === "string") setLyricsStyleTags(p.lyricsStyleTags);
      if (typeof p.seedWorkId === "string") setSeedWorkId(p.seedWorkId);
      if (typeof p.selectedPresetId === "string") setSelectedPresetId(p.selectedPresetId);
      if (typeof p.referenceWorkId === "string") setReferenceWorkId(p.referenceWorkId);
      if (p.referenceAvOffset && typeof p.referenceAvOffset === "object") {
        const off = p.referenceAvOffset as { arousal?: number; valence?: number };
        setReferenceAvOffset({
          arousal: typeof off.arousal === "number" ? off.arousal : 0,
          valence: typeof off.valence === "number" ? off.valence : 0,
        });
      }
      if (p.creativeSpec && typeof p.creativeSpec === "object") {
        setCreativeSpec({ ...emptyCreativeSpec(), ...(p.creativeSpec as MusicCreativeSpec) });
      }
      setItem(`studio:draftId:${mode}`, draft.id);
      setItem(`studio:draftVersion:${mode}`, String(draft.version));
    },
    c.draftConflict,
  );

  useEffect(() => {
    bootstrapAuth();
    creditsCtx?.refresh();
    vibeApi.getPresets().then(setPresets).catch(() => {});
    vibeApi
      .getPlatformConfig()
      .then((cfg) => {
        if (cfg.studio.sound_recipe) setSoundRecipeOptions(cfg.studio.sound_recipe as SoundRecipeOptions);
        if (cfg.studio.keys?.length) setKeyOptions(cfg.studio.keys);
        if (cfg.studio.bpm_presets?.length) setBpmPresets(cfg.studio.bpm_presets);
      })
      .catch(() => {
        vibeApi.getSoundRecipeOptions().then((opts) => setSoundRecipeOptions(opts as SoundRecipeOptions)).catch(() => {});
      });

    const seed = getItem("create:seedWorkId");
    const seedMode = getItem("create:mode") as CreateMode | null;
    const seedIntent = getItem("create:seedIntent");
    const presetFromCopilot = getItem("create:presetId");
    const refFromCopilot = getItem("create:referenceWorkId");
    const creativeSpecFromCopilot = getItem("create:creativeSpec");
    const importSpecRaw = getItem("create:importSpec");
    if (importSpecRaw) {
      try {
        setCreativeSpec({ ...emptyCreativeSpec(), ...JSON.parse(importSpecRaw) });
        showSuccess(copy.marketplaceUi.purchaseSuccess);
      } catch {
        /* ignore */
      }
      removeItem("create:importSpec");
    }
    if (creativeSpecFromCopilot) {
      try {
        setCreativeSpec({ ...emptyCreativeSpec(), ...JSON.parse(creativeSpecFromCopilot) });
      } catch {
        /* ignore */
      }
      removeItem("create:creativeSpec");
    }
    if (presetFromCopilot) {
      setSelectedPresetId(presetFromCopilot);
      removeItem("create:presetId");
    }
    if (refFromCopilot) {
      setReferenceWorkId(refFromCopilot);
      removeItem("create:referenceWorkId");
    }
    const lyricsFromCopilot = getItem("create:lyrics");
    if (lyricsFromCopilot) {
      setLyrics(lyricsFromCopilot);
      setMode("lyrics");
      removeItem("create:lyrics");
    }
    const optimizeHint = getItem("create:optimizeHint");
    if (optimizeHint) {
      setTextIntent((prev) => (prev.trim() ? `${prev.trim()} · ${optimizeHint}` : optimizeHint));
      removeItem("create:optimizeHint");
    }
    const targetBpm = getItem("create:targetBpm");
    const targetKey = getItem("create:targetKey");
    if (targetBpm || targetKey) {
      setCreativeSpec((prev) => {
        const next = { ...prev };
        if (targetBpm) {
          const bpmVal = parseInt(targetBpm, 10);
          if (!Number.isNaN(bpmVal)) {
            next.bpm = bpmVal;
            next.bpm_range = [Math.max(40, bpmVal - 8), Math.min(200, bpmVal + 8)];
          }
        }
        if (targetKey) next.key = targetKey;
        return next;
      });
      removeItem("create:targetBpm");
      removeItem("create:targetKey");
    }
    if (seed) {
      const resolvedMode = seedMode === "cover" ? "cover" : seedMode === "variation" ? "variation" : "remix";
      setSeedWorkId(seed);
      setMode(resolvedMode);
      if (seedIntent) {
        setTextIntent(seedIntent);
      } else if (resolvedMode === "remix") {
        setTextIntent(copy.derivative.remix.example);
      }
      const seedTitle = getItem("create:seedTitle");
      if (seedTitle) setSeedWorkTitle(seedTitle);
      removeItem("create:seedWorkId");
      removeItem("create:mode");
      removeItem("create:seedIntent");
      removeItem("create:seedTitle");
    }

    const journeyRaw = getItem("journey:waypoints");
    if (journeyRaw && !seed) {
      try {
        const data = JSON.parse(journeyRaw) as { customIntent?: string };
        if (data.customIntent) setTextIntent(data.customIntent);
      } catch {
        /* ignore */
      }
    }

    const challengeSlug = router.params.challenge || getItem("create:challengeSlug");
    if (challengeSlug) {
      removeItem("create:challengeSlug");
      vibeApi
        .getChallenge(challengeSlug)
        .then((data) => {
          setTextIntent(data.description || `#${data.hashtag} ${data.title}`);
        })
        .catch(() => {});
    } else {
      const seedIntentOnly = getItem("create:seedIntent");
      if (seedIntentOnly && !seed) setTextIntent(seedIntentOnly);
    }
  }, [router.params.challenge, copy.derivative.remix.example]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setItem(STUDIO_CREATIVE_SPEC_KEY, JSON.stringify(creativeSpec));
    }, 400);
    return () => clearTimeout(timer);
  }, [creativeSpec]);

  useDidShow(() => {
    const seed = getItem("create:seedWorkId");
    if (seed) {
      const seedMode = getItem("create:mode") as CreateMode | null;
      const seedIntent = getItem("create:seedIntent");
      const resolvedMode =
        seedMode === "cover" ? "cover" : seedMode === "variation" ? "variation" : seedMode === "remix" ? "remix" : "variation";
      setSeedWorkId(seed);
      setMode(resolvedMode);
      if (seedIntent) {
        setTextIntent(seedIntent);
      } else if (resolvedMode === "remix") {
        setTextIntent(copy.derivative.remix.example);
      }
      const seedTitle = getItem("create:seedTitle");
      if (seedTitle) setSeedWorkTitle(seedTitle);
      removeItem("create:seedWorkId");
      removeItem("create:mode");
      removeItem("create:seedIntent");
      removeItem("create:seedTitle");
    }

    vibeApi.trackEvent("create_page_view", { logged_in: isLoggedIn() }).catch(() => {});
    void creditsCtx?.refresh();
    if (activeJobId) return;
    const ctxJob = activeJobCtx?.job;
    if (ctxJob?.jobId && !isTerminalJobStatus(ctxJob.status)) {
      setActiveJobId(ctxJob.jobId);
      setActiveJobStartedAt(ctxJob.startedAt);
      return;
    }
    resolveRestorableJobId().then((restored) => {
      if (!restored) return;
      setActiveJobId(restored.jobId);
      setActiveJobStartedAt(restored.startedAt);
      if (restored.remixSource) {
        setActiveRemixSource(restored.remixSource);
        setMode("remix");
      }
    });
    if (isLoggedIn()) {
      vibeApi.getSubscription().then(setSubscription).catch(() => setSubscription(null));
      vibeApi
        .listWorks()
        .then((list) => {
          setWorksCount(list.length);
          const latest = list[0];
          setRecentWork(latest ? { id: latest.id, title: latest.title } : null);
          setPickerWorks(list.slice(0, 12).map((w) => ({ id: w.id, title: w.title, cover_url: w.cover_url })));
        })
        .catch(() => {});
    } else {
      setWorksCount(0);
      setRecentWork(null);
    }
    void loadDrafts();

    const copilotConfirm = getItem("create:copilotConfirm");
    const copilotEstimate = getItem("create:copilotEstimate");
    if (copilotConfirm === "1") {
      removeItem("create:copilotConfirm");
      removeItem("create:copilotEstimate");
      const estLabel = copilotEstimate
        ? c.copilotConfirmBody.replace("{n}", copilotEstimate)
        : c.copilotConfirmBodyShort;
      Taro.showModal({
        title: c.copilotConfirmTitle,
        content: estLabel,
        confirmText: c.copilotConfirmGo,
        cancelText: c.copilotConfirmCancel,
        success: (r) => {
          if (r.confirm) void generate();
        },
      });
    }
  });

  useEffect(() => {
    if (!seedWorkId || seedWorkTitle || !isLoggedIn()) return;
    let cancelled = false;
    vibeApi
      .getWork(seedWorkId)
      .then((work) => {
        if (!cancelled) setSeedWorkTitle(work.title);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [seedWorkId, seedWorkTitle]);

  const modeTiles = useMemo<ModeTileItem[]>(
    () => [
      { id: "quickTrack", icon: "music", title: c.modeQuickTrack, description: c.modeQuickTrackDesc },
      { id: "playlist", icon: "playlist", title: c.modeQuickPlaylist, description: c.modeQuickPlaylistDesc, accent: true },
      { id: "journey", icon: "journey", title: c.modeJourney, description: c.modeJourneyDesc },
      { id: "remix", icon: "remix", title: c.modeRemix, description: c.modeRemixDesc },
      { id: "cover", icon: "create", title: c.modeCover, description: c.modeCoverDesc },
      { id: "variation", icon: "remix", title: c.modeVariation, description: c.modeVariationDesc },
    ],
    [
      c.modeQuickTrack,
      c.modeQuickTrackDesc,
      c.modeQuickPlaylist,
      c.modeQuickPlaylistDesc,
      c.modeJourney,
      c.modeJourneyDesc,
      c.modeRemix,
      c.modeRemixDesc,
      c.modeCover,
      c.modeCoverDesc,
      c.modeVariation,
      c.modeVariationDesc,
    ]
  );

  const primaryModeTiles = useMemo(
    () => modeTiles.filter((t) => t.id === "quickTrack" || t.id === "remix"),
    [modeTiles]
  );

  const moreModeTiles = useMemo(
    () => modeTiles.filter((t) => t.id !== "quickTrack" && t.id !== "remix"),
    [modeTiles]
  );

  const createStepIndex = useMemo(() => {
    if (mode === "remix") {
      if (textIntent.trim().length >= 3 && seedWorkId && seedRemixAllowed) return 2;
      if (textIntent.trim() || seedWorkId) return 1;
      return 0;
    }
    const hasIntent = !!(textIntent.trim() || selectedPresetId || hasCreativeConstraints(creativeSpec));
    return hasIntent ? 2 : 1;
  }, [mode, textIntent, seedWorkId, seedRemixAllowed, selectedPresetId, creativeSpec]);

  function handleModeSelect(id: string) {
    if (id === "journey") {
      openStackPage(STUDIO_PAGE_ROUTES.journey);
      return;
    }
    setMode(id as CreateMode);
    setCoverStep("pick");
    setMoreModesOpen(false);
    if (id === "variation" || id === "cover") {
      setAdvancedOpen(true);
    }
    if (id === "remix" && !seedWorkId) {
      setTextIntent("");
    }
  }

  async function loadDrafts() {
    if (!isLoggedIn()) return;
    try {
      setDrafts(await vibeApi.listDrafts());
    } catch {
      setDrafts([]);
    }
  }

  async function selectPreset(p: StylePreset) {
    setSelectedPresetId(p.id);
    trackActivation("activation_preset_selected", { preset_id: p.id });
    setMood({ presetKey: p.id, hue: 42 + (p.id.length % 30) });
    try {
      const applied = await vibeApi.applyPreset(p.id, 6, textIntent);
      if (applied.text_intent) setTextIntent(applied.text_intent);
      setCreativeSpec((prev) => mergePresetApplied(prev, applied, soundRecipeOptions ?? undefined));
    } catch {
      if (p.example_intent) setTextIntent(p.example_intent);
    }
  }

  async function parseIntentOnBlur() {
    const draft = textIntent.trim();
    if (draft.length < 3 || !isLoggedIn()) return;
    try {
      const res = await vibeApi.parseMusicIntent(draft);
      setCreativeSpec((prev) =>
        mergeParsedSpec(prev, res.creative_spec as Partial<MusicCreativeSpec>, draft),
      );
    } catch {
      /* optional parse */
    }
  }

  async function handle402(required = creditCost, source = "create") {
    await creditsCtx?.refresh();
    vibeApi
      .trackEvent("402_insufficient", {
        source,
        required,
        balance: creditsCtx?.balance ?? 0,
      })
      .catch(() => {});
    openPaywall({ required, source, tab: "pack" });
  }

  function openPaywall(opts?: { required?: number; source?: string; tab?: "member" | "pack" }) {
    setPaywallCredits(opts?.required ?? creditCost);
    setPaywallSource(opts?.source ?? "create_dock");
    setPaywallTab(opts?.tab ?? "pack");
    setPaywallOpen(true);
  }

  function modeLabel(m: CreateMode) {
    const map: Record<CreateMode, string> = {
      quickTrack: modes.quickTrack,
      playlist: modes.playlist || c.modeQuickPlaylist,
      lyrics: modes.lyrics || "歌词创作",
      remix: modes.remix || "Remix",
      cover: modes.cover || "翻唱",
      variation: modes.variation || "变体实验",
    };
    return map[m];
  }

  async function polishIntentAi() {
    if (!requireAuth()) return;
    const draft = textIntent.trim();
    if (draft.length < 3) {
      showError(c.polishNeedIntent);
      return;
    }
    setPolishingIntent(true);
    try {
      const res = await vibeApi.polishIntent(draft);
      setTextIntent(res.text_intent);
      showSuccess(c.polishSuccess);
    } catch {
      showError(c.generateFail);
    } finally {
      setPolishingIntent(false);
    }
  }

  async function generateLyricsAi() {
    if (!requireAuth()) return;
    setGeneratingLyrics(true);
    try {
      const res = await vibeApi.generateLyrics(textIntent, [], "zh");
      setLyrics(res.lyrics);
      setLyricsStyleTags(res.style_tags?.trim() || "");
      if (res.style_tags?.trim()) {
        setCreativeSpec((prev) => ({ ...prev, style_tags: res.style_tags!.trim() }));
      }
      if (res.song_title?.trim() && !workTitle.trim()) {
        setWorkTitle(res.song_title.trim().slice(0, 60));
      }
      applyCreditsResponse(creditsCtx, res);
      showSuccess(c.lyricsGenerated);
    } catch (e) {
      if (isInsufficientCredits(e)) handle402();
      else showError(c.generateFail);
    } finally {
      setGeneratingLyrics(false);
    }
  }

  async function coverPreprocess() {
    if (!seedWorkId) return;
    setSubmitting(true);
    try {
      const res = await vibeApi.coverPreprocess(seedWorkId);
      if (res.formatted_lyrics) setCoverLyrics(res.formatted_lyrics);
      setCoverStep("generate");
      showSuccess(c.coverPreprocessDone);
    } catch {
      showError(c.generateFail);
    } finally {
      setSubmitting(false);
    }
  }

  async function saveDraft() {
    if (!requireAuth()) return;
    setSavingDraft(true);
    try {
      await vibeApi.saveDraft(textIntent.slice(0, 40) || "Draft", mode, {
        textIntent,
        lyrics,
        lyricsStyleTags,
        seedWorkId,
        selectedPresetId,
      });
      showSuccess(c.draftSaved);
      void loadDrafts();
    } catch {
      showError(c.generateFail);
    } finally {
      setSavingDraft(false);
    }
  }

  function openCopilot() {
    setAdvancedOpen(false);
    if (!requireAuth("/packageCopilot/pages/copilot/index")) return;
    openStackPage("/packageCopilot/pages/copilot/index");
  }

  function applyDraft(d: { id: string; title: string; mode: string; payload: Record<string, unknown> }) {
    const p = d.payload || {};
    setMode((d.mode as CreateMode) || "quickTrack");
    if (typeof p.textIntent === "string") setTextIntent(p.textIntent);
    if (typeof p.lyrics === "string") setLyrics(p.lyrics);
    if (typeof p.lyricsStyleTags === "string") setLyricsStyleTags(p.lyricsStyleTags);
    if (typeof p.seedWorkId === "string") setSeedWorkId(p.seedWorkId);
    if (typeof p.selectedPresetId === "string") setSelectedPresetId(p.selectedPresetId);
    setDraftsOpen(false);
  }

  async function removeDraft(id: string) {
    if (!requireAuth()) return;
    try {
      await vibeApi.deleteDraft(id);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
      showSuccess(c.draftDeleted);
    } catch {
      showError(c.generateFail);
    }
  }

  async function generate() {
    if (submitting || jobBlocking || generateLatchRef.current) return;
    if (!requireAuth()) return;
    const cost = creditCost;
    if (!(await ensureSufficientCredits(creditsCtx, cost, () => handle402(cost)))) return;
    if (mode === "remix") {
      if (!seedWorkId) {
        showError(c.remixFlow.needSource);
        return;
      }
      if (textIntent.trim().length < 3) {
        showError(c.remixFlow.needIntent);
        return;
      }
      if (!seedRemixAllowed) {
        showError(copy.derivative.remixNotAllowed);
        return;
      }
    } else if (!textIntent.trim() && !selectedPresetId && !hasCreativeConstraints(creativeSpec)) {
      showError(c.needIntent);
      return;
    }
    if (mode === "lyrics" && !lyrics.trim()) {
      showError(c.needLyrics);
      return;
    }
    if (mode === "cover" && coverStep === "pick") {
      setCoverStep("preprocess");
      return;
    }
    if (mode === "cover" && coverStep === "preprocess") {
      await coverPreprocess();
      return;
    }
    if ((mode === "variation" || mode === "cover") && !seedWorkId) {
      showError(c.needSeed);
      return;
    }
    if (shouldPromptWorkTitle(mode, coverStep)) {
      const fallback =
        mode === "playlist"
          ? c.defaultPlaylistTitle
          : mode === "lyrics"
            ? c.defaultLyricsTitle
            : mode === "remix"
              ? c.remixFlow.defaultTitle
              : c.defaultTrackTitle;
      const remixSuggest =
        mode === "remix" && seedWorkTitle.trim()
          ? `${c.remixFlow.defaultTitle} · ${seedWorkTitle.trim()}`.slice(0, 60)
          : "";
      setTitleDraft(
        workTitle.trim() ||
          remixSuggest ||
          resolveWorkTitle("", textIntent, fallback, titleSuggestOpts),
      );
      setTitleSheetOpen(true);
      return;
    }
    await requestGenerate();
  }

  async function requestGenerate(titleOverride?: string) {
    if (!requireAuth()) return;
    try {
      const status = await fetchConsentStatus();
      if (status.missing.includes("ai_notice")) {
        pendingGenerateTitleRef.current = titleOverride;
        setAiDisclaimerOpen(true);
        return;
      }
    } catch {
      /* proceed if status check fails */
    }
    await executeGenerate(titleOverride);
  }

  async function confirmAiDisclaimer() {
    setAiConsentLoading(true);
    try {
      await ensureAiNoticeConsent();
      setAiDisclaimerOpen(false);
      await executeGenerate(pendingGenerateTitleRef.current);
      pendingGenerateTitleRef.current = undefined;
    } catch {
      showError(c.generateFail);
    } finally {
      setAiConsentLoading(false);
    }
  }

  async function executeGenerate(titleOverride?: string) {
    if (submitting || jobBlocking || generateLatchRef.current) return;
    if (titleOverride !== undefined && titleOverride.trim()) {
      setWorkTitle(titleOverride.trim());
    }
    setTitleSheetOpen(false);
    if (!(await ensureSufficientCredits(creditsCtx, creditCost, () => handle402(creditCost)))) return;
    await requestGenerationSubscribeMessages();
    generateLatchRef.current = true;
    setSubmitting(true);
    const idempotencyKey = generateIdempotencyKey();
    vibeApi.trackEvent("studio_generate_start", { mode }).catch(() => {});
    trackActivationOnce("activation_first_generate_start", { mode });
    const fallback =
      mode === "playlist"
        ? c.defaultPlaylistTitle
        : mode === "lyrics"
          ? c.defaultLyricsTitle
          : mode === "remix"
            ? c.remixFlow.defaultTitle
            : c.defaultTrackTitle;
    const remixFallback =
      mode === "remix" && seedWorkTitle.trim()
        ? `${c.remixFlow.defaultTitle} · ${seedWorkTitle.trim()}`.slice(0, 60)
        : fallback;
    const resolvedTitle = resolveWorkTitle(titleOverride ?? workTitle, textIntent, remixFallback, titleSuggestOpts);
    const payloadSpec = buildPayloadSpec(creativeSpec, textIntent, lyricsStyleTags);
    let jobId: string | undefined;
    let resolvedJobType: "single" | "playlist" | "variations" | "remix" = "single";
    let creditsPayload: CreditsApiPayload | undefined;
    try {
      if (mode === "quickTrack") {
        const singlePayload: Parameters<typeof vibeApi.generateSingle>[0] = {
          text_intent: textIntent,
          instrumental: !lyrics.trim(),
          title: resolvedTitle,
          creative_spec: payloadSpec,
          moods: payloadSpec.moods,
          genres: payloadSpec.genres,
          bpm: payloadSpec.bpm ?? undefined,
          key: payloadSpec.key !== "auto" ? payloadSpec.key : undefined,
          preview_pick_count: 1,
        };
        if (lyrics.trim()) {
          singlePayload.lyrics = lyrics.trim();
          singlePayload.instrumental = false;
        }
        if (lyricsStyleTags.trim()) {
          singlePayload.style_tags = lyricsStyleTags.trim();
        }
        if (referenceWorkId) {
          singlePayload.reference = {
            work_id: referenceWorkId,
            av_offset:
              referenceAvOffset.arousal || referenceAvOffset.valence
                ? referenceAvOffset
                : undefined,
          };
        }
        const job = await vibeApi.generateSingle({ ...singlePayload, idempotencyKey });
        jobId = job.id;
        resolvedJobType = job.job_type === "variations" ? "variations" : "single";
        creditsPayload = job;
      } else if (mode === "playlist") {
        let journey = {
          mode: "prompt_journey",
          steps: 6,
          target_curve: "calm_to_energy",
          instrumental: true,
          title: resolvedTitle,
          waypoints: [] as Array<{ step: number; arousal: number; valence: number }>,
        };
        let musicParams = { bpm_range: [80, 120], key: "auto", duration_preference: "medium" };
        if (selectedPresetId) {
          const applied = await vibeApi.applyPreset(selectedPresetId, 6, textIntent);
          if (applied.journey) journey = applied.journey as typeof journey;
          if (applied.music_params) musicParams = applied.music_params as typeof musicParams;
        }
        if (referenceWorkId) {
          journey = {
            ...journey,
            reference: {
              work_id: referenceWorkId,
              av_offset:
                referenceAvOffset.arousal || referenceAvOffset.valence
                  ? referenceAvOffset
                  : undefined,
            },
          };
        }
        const job = await vibeApi.generatePlaylistBody(
          {
            text_intent: textIntent,
            preset_id: selectedPresetId || undefined,
            generation_mode: "prompt_journey",
            journey,
            music_params: musicParams,
            creative_spec: payloadSpec,
            moods: payloadSpec.moods,
            genres: payloadSpec.genres,
          },
          idempotencyKey,
        );
        jobId = job.id;
        resolvedJobType = "playlist";
        creditsPayload = job;
      } else if (mode === "lyrics") {
        if (!lyrics.trim()) {
          showError(c.needLyrics);
          return;
        }
        const job = await vibeApi.generateSingle({
          text_intent: textIntent,
          lyrics: lyrics.trim(),
          style_tags: lyricsStyleTags.trim() || undefined,
          song_title: workTitle.trim() || undefined,
          instrumental: false,
          title: resolvedTitle,
          creative_spec: payloadSpec,
          moods: payloadSpec.moods,
          genres: payloadSpec.genres,
          preview_pick_count: 1,
          idempotencyKey,
        });
        jobId = job.id;
        resolvedJobType = job.job_type === "variations" ? "variations" : "single";
        creditsPayload = job;
      } else if (mode === "remix" && seedWorkId) {
        const res = await vibeApi.remix(seedWorkId, textIntent, { title: resolvedTitle, idempotencyKey });
        jobId = res.job_id;
        resolvedJobType = "remix";
        creditsPayload = res;
      } else if (mode === "cover" && seedWorkId) {
        const res = await vibeApi.musicCover(seedWorkId, textIntent, {
          cover_mode: "two_step",
          modified_lyrics: coverLyrics || undefined,
          idempotencyKey,
        });
        jobId = res.job_id;
        creditsPayload = res;
      } else if (mode === "variation" && seedWorkId) {
        const job = await vibeApi.generateVariations({
          seed_work_id: seedWorkId,
          text_intent: textIntent,
          title: resolvedTitle,
          idempotencyKey,
        });
        jobId = job.id;
        resolvedJobType = "variations";
        creditsPayload = job;
      } else {
        showError(c.needSeed);
        return;
      }
    } catch (e) {
      if (isActiveJobLimit(e)) {
        const modal = await Taro.showModal({
          title: copy.generationErrors.ACTIVE_JOB_LIMIT.title,
          content: copy.generationErrors.ACTIVE_JOB_LIMIT.body,
          confirmText: copy.generation.viewActiveJob,
          cancelText: copy.common?.cancel || "取消",
        });
        if (modal.confirm) {
          try {
            const active = await vibeApi.getActiveJob();
            if (active?.id) {
              setActiveJobId(active.id);
              setActiveJobType((active.job_type as typeof resolvedJobType) || "single");
            }
          } catch {
            showError(c.activeJobLimit);
          }
        }
        return;
      }
      if (isQueueOverload(e)) {
        showError(copy.generation.queueOverload);
        return;
      }
      if (isRateLimited(e)) {
        const wait = getRateLimitRetryAfter(e);
        showError(
          wait != null
            ? copy.generation.rateLimitedWithSeconds.replace("{n}", String(wait))
            : copy.generation.rateLimited
        );
        return;
      }
      if (isInsufficientCredits(e)) {
        handle402();
        return;
      }
      if (mode === "remix" && isRemixForbidden(e)) {
        showError(copy.derivative.remixNotAllowed);
        return;
      }
      showError(c.generateFail);
      return;
    } finally {
      generateLatchRef.current = false;
      setSubmitting(false);
    }

    if (!jobId) return;

    const startedAt = new Date().toISOString();
    const jobType = resolvedJobType;
    const remixSource: RemixSourceSnapshot | undefined =
      mode === "remix" && seedWorkId
        ? { workId: seedWorkId, title: seedWorkTitle, intent: textIntent.trim() }
        : undefined;
    activeJobCtx?.setJob({
      jobId,
      progress: 0,
      status: "running",
      message: "",
      returnUrl: "/pages/create/index",
      startedAt,
      jobType,
      remixSourceTitle: remixSource?.title,
    });
    setActiveJobId(jobId);
    setActiveJobType(jobType);
    setActiveJobStartedAt(startedAt);
    if (remixSource) setActiveRemixSource(remixSource);
    persistActiveGeneration({
      jobId,
      returnUrl: "/pages/create/index",
      startedAt,
      jobType,
      remixSource,
    });
    setItem("create:lastDraft", JSON.stringify({ textIntent, lyrics, mode, seedWorkId }));
    applyCreditsResponse(creditsCtx, creditsPayload);
    const taskGrant = taskCreditsGranted(creditsPayload);
    if (taskGrant) {
      showSuccess(copy.progressUi.taskReward.replace("{n}", String(taskGrant)));
    }
  }

  const needsSeed = mode === "cover" || mode === "variation";
  const dockCta =
    creditsBlocked
      ? c.dockTopUp
      : mode === "cover" && coverStep === "preprocess"
        ? c.coverPreprocess
        : mode === "cover" && coverStep === "generate"
          ? c.coverStepGenerate
          : c.dockGenerate;

  const titleFallback =
    mode === "playlist"
      ? c.defaultPlaylistTitle
      : mode === "lyrics"
        ? c.defaultLyricsTitle
        : mode === "remix"
          ? c.remixFlow.defaultTitle
          : c.defaultTrackTitle;
  const suggestedTitleForSheet =
    mode === "remix" && seedWorkTitle.trim()
      ? `${c.remixFlow.defaultTitle} · ${seedWorkTitle.trim()}`.slice(0, 60)
      : resolveWorkTitle("", textIntent, titleFallback, titleSuggestOpts);

  return (
    <PageShell
      title={copy.pages.create.title}
      subtitle={copy.brand.tagline}
      showCredits={false}
      ambient
      tabVariant
      wide
      noPadTop
      hideHeader
    >
      <View className={`tab-page create-home${activeJobId ? " create-home--generating" : ""}${coachOpen ? " create-home--coach-open" : ""}`}>
        {isLoggedIn() && <CommercialAlertBanners subscription={subscription} />}
        {!activeJobId && (
        <View className="create-home__form">
        <View className="create-home__deck">
          <View className="create-home__deck-glow" />
          <View className="create-home__deck-head">
            <View className="create-home__deck-brand">
              <View className="create-home__deck-sigil">
                <View className="create-home__deck-wave" aria-hidden>
                  <View className="create-home__deck-wave-bar" />
                  <View className="create-home__deck-wave-bar" />
                  <View className="create-home__deck-wave-bar" />
                  <View className="create-home__deck-wave-bar" />
                </View>
              </View>
              <View>
                <Text className="create-home__deck-title">{copy.pages.create.title}</Text>
                {worksCount > 0 && (
                  <Text className="create-home__deck-sub">{c.homeDeckWorksCount.replace("{n}", String(worksCount))}</Text>
                )}
              </View>
            </View>
            <Button
              variant="ghost"
              size="sm"
              className="create-home__draft-btn"
              onClick={() => {
                void loadDrafts();
                setDraftsOpen(true);
              }}
            >
              {c.draftEntry}
            </Button>
          </View>

          {(credits != null || creditsCtx?.loading) && isLoggedIn() && (
            <View
              className="create-home__deck-meter"
              onClick={() => {
                vibeApi.trackEvent("create_credits_chip_tap", { balance: credits ?? 0 }).catch(() => {});
                openPaywall({ source: "create_deck", tab: "pack" });
              }}
            >
              <View className="create-home__deck-meter-top">
                <Text className="create-home__deck-credits">
                  {credits != null ? c.homeDeckCredits.replace("{n}", String(credits)) : "…"}
                </Text>
                <Text className="create-home__deck-recharge">{copy.profileUi.recharge}</Text>
              </View>
              <View className="create-home__deck-bar">
                <View
                  className="create-home__deck-bar-fill"
                  style={{ width: `${Math.min(100, Math.max(8, credits * 12))}%` }}
                />
              </View>
            </View>
          )}

          <View className="create-home__deck-steps">
            {deckSteps.map((step, i) => (
              <View key={step.num} className="create-home__deck-step">
                {i > 0 && <View className="create-home__deck-step-line" />}
                <View className="create-home__deck-step-node">
                  <Text className="create-home__deck-step-num">{step.num}</Text>
                </View>
                <Text className="create-home__deck-step-label">{step.label}</Text>
              </View>
            ))}
          </View>

          <View className="create-home__deck-actions">
            {recentWork && (
              <View className="create-home__deck-chip create-home__deck-chip--accent" onClick={() => openWorkDetail(recentWork.id)}>
                <Icon name="play" size="sm" accent />
                <Text className="create-home__deck-chip-text">{c.homeDeckRecent.replace("{title}", recentWork.title)}</Text>
              </View>
            )}
            <View className="create-home__deck-chip" onClick={() => Taro.navigateTo({ url: STACK_PAGE_ROUTES.works })}>
              <Icon name="music" size="sm" />
              <Text className="create-home__deck-chip-text">{c.homeDeckMyWorks}</Text>
            </View>
            <View className="create-home__deck-chip" onClick={() => openStackPage(STUDIO_PAGE_ROUTES.journey)}>
              <Icon name="journey" size="sm" accent />
              <Text className="create-home__deck-chip-text">{c.homeDeckJourney}</Text>
            </View>
          </View>
        </View>

        {mode !== "remix" && soundRecipeOptions && (
          <Suspense fallback={<LoadingSkeleton count={1} />}>
            <SoundRecipePanel
              spec={creativeSpec}
              options={soundRecipeOptions}
              keyOptions={keyOptions}
              bpmPresets={bpmPresets}
              onChange={(next) => setCreativeSpec({ ...next, custom_prompt_override: "" })}
            />
          </Suspense>
        )}

        {mode !== "remix" && diagnosisOpen && !activeJobId && (mode === "quickTrack" || mode === "lyrics") && (
          <Suspense fallback={null}>
            <EmotionDiagnosisCard
            onApply={({ arousal, valence, intentHint, genres, summary }) => {
              setCreativeSpec((prev) => ({
                ...prev,
                arousal,
                valence,
                genres: prev.genres.length ? prev.genres : genres,
              }));
              if (!textIntent.trim() || textIntent === c.defaultIntent) setTextIntent(intentHint);
              setDiagnosisSummary(summary);
              setDiagnosisOpen(false);
            }}
            onDismiss={() => setDiagnosisOpen(false)}
          />
          </Suspense>
        )}

        {mode !== "remix" && !diagnosisOpen && diagnosisSummary && !activeJobId && (mode === "quickTrack" || mode === "lyrics") && (
          <View className="create-home__diagnosis-echo" onClick={() => setDiagnosisOpen(true)}>
            <Text className="create-home__diagnosis-echo-text">{diagnosisSummary}</Text>
            <Text className="create-home__diagnosis-echo-edit">{c.diagnosisReopen}</Text>
          </View>
        )}

        {mode !== "remix" && (
          <CreateFormulaPanel
            intentLabel={c.homePromptLabel}
            intentHint={c.homePromptHint}
            intentPlaceholder={c.defaultIntent}
            textIntent={textIntent}
            onTextIntentChange={(v) => {
              setTextIntent(v);
              if (creativeSpec.custom_prompt_override?.trim()) {
                setCreativeSpec((prev) => ({ ...prev, custom_prompt_override: "" }));
              }
            }}
            polishLabel={c.polishIntent}
            polishingLabel={c.polishingIntent}
            polishing={polishingIntent}
            onPolish={polishIntentAi}
            onIntentBlur={parseIntentOnBlur}
            intentTip={!seedWorkId && mode !== "cover" ? c.intentFirstHint : undefined}
            maxlength={500}
          />
        )}

        {mode !== "remix" && soundRecipeOptions && (
          <PromptPreviewBar
            spec={creativeSpec}
            textIntent={textIntent}
            styleTags={lyricsStyleTags}
            onOverrideChange={(override) => setCreativeSpec((prev) => ({ ...prev, custom_prompt_override: override }))}
          />
        )}

        <View className="create-home__section">
          <StepRail
            className="create-home__steps"
            steps={[
              { id: "mode", label: c.homeDeckStep2, icon: "create" },
              { id: "intent", label: c.homeDeckStep1, icon: "sigil" },
              { id: "generate", label: c.homeDeckStep3, icon: "music" },
            ]}
            current={createStepIndex}
          />
          <SectionLabel>{c.modeSectionLabel}</SectionLabel>
          <ModeTileGrid items={primaryModeTiles} activeId={mode} layout="rail" onSelect={handleModeSelect} />
          <Button variant="ghost" size="sm" block className="create-home__more-modes" onClick={() => setMoreModesOpen(true)}>
            {c.moreModesLabel}
          </Button>
        </View>

        {mode === "remix" && (
          <View className="create-home__section create-home__section--remix">
            <Suspense fallback={<LoadingSkeleton count={2} />}>
              <RemixFlowPanel
              sourceWorkId={seedWorkId}
              intent={textIntent}
              onSourceChange={(id, title) => {
                setSeedWorkId(id);
                setSeedWorkTitle(title || "");
                if (title) setItem("create:seedTitle", title);
              }}
              onIntentChange={setTextIntent}
              onRemixAllowedChange={setSeedRemixAllowed}
              polishLabel={c.polishIntent}
              polishingLabel={c.polishingIntent}
              polishing={polishingIntent}
              onPolish={polishIntentAi}
            />
            </Suspense>
          </View>
        )}

        {mode !== "remix" && (
          <View className="create-home__section create-home__section--presets">
            <SectionLabel>{c.presetLabel}</SectionLabel>
            <Suspense fallback={<LoadingSkeleton count={2} />}>
              <PresetCarousel
              className="create-home__presets"
              presets={presets}
              selectedId={selectedPresetId}
              onSelect={selectPreset}
              isMember={creditsCtx?.isMember}
              onMemberGate={() => {
                vibeApi.trackEvent("member_preset_gate", { preset_id: selectedPresetId }).catch(() => {});
                openPaywall({ source: "create_member_preset", tab: "member" });
              }}
            />
            </Suspense>
          </View>
        )}

        </View>
        )}

        {activeJobId && (
            <GenerationProgress
              jobId={activeJobId}
              returnUrl="/pages/create/index"
              startedAt={activeJobStartedAt}
              jobType={activeJobType}
              remixSource={activeRemixSource ?? undefined}
              onRetry={() => {
                setActiveJobId(null);
                void generate();
              }}
              onEditIntent={() => {
                setActiveJobId(null);
                activeJobCtx?.setJob(null);
                clearActiveGeneration();
              }}
            />
        )}

        {!activeJobId && isLoggedIn() && (
          <View className="create-home__engagement">
            <Suspense fallback={null}>
              <LazyEngagementPanel variant="compact" showHeader={false} />
            </Suspense>
          </View>
        )}

        {!activeJobId && (
        <View className="create-home__dock">
          <View className="create-home__dock-glow" />
          <View className="create-home__dock-inner">
            <CreditEstimateMeter
              mode={estimateMode}
              variations={mode === "variation" ? 3 : undefined}
              onCreditsChange={setEstimatedCredits}
              onLowCreditsClick={() => openPaywall({ source: "create_estimate", tab: "pack" })}
              showShortfall
              silent
            />
            <View className="create-home__dock-top">
              <View className="create-home__dock-left">
                <View className="create-home__mode-pill">
                  <Text className="create-home__mode">{modeLabel(mode)}</Text>
                </View>
                <View className="create-home__advanced" onClick={() => setAdvancedOpen(true)}>
                  <Text className="create-home__advanced-text">{c.advancedShort}</Text>
                  <Icon name="chevronDown" size="sm" accent />
                </View>
                {creditsCtx?.isMember && (
                  <View className="create-home__member-tag">
                    <Text className="create-home__member-tag-text">{c.dockMemberBadge}</Text>
                  </View>
                )}
              </View>
              <View
                className={`create-home__balance${credits != null && credits < creditCost ? " create-home__balance--low" : ""}`}
                onClick={() => openPaywall({ source: "create_dock", tab: "pack" })}
              >
                <Text className="create-home__balance-num">{credits ?? "—"}</Text>
                <Text className="create-home__balance-label">{c.dockBalance}</Text>
              </View>
            </View>
            {!creditsCtx?.isMember && (
              <Text
                className="create-home__dock-nudge"
                onClick={() => openPaywall({ source: "create_dock", tab: "member" })}
              >
                {c.dockMemberNudge}
              </Text>
            )}
            <Button
              variant="primary"
              block
              loading={submitting || jobBlocking}
              disabled={creditsBlocked ? false : !remixReady}
              onClick={() => {
                if (!isLoggedIn()) {
                  requireAuth();
                  return;
                }
                if (creditsBlocked) {
                  openPaywall({ source: "create_dock", tab: "pack" });
                  return;
                }
                void generate();
              }}
            >
              {dockCta}
            </Button>
            {!creditsBlocked && creditCost > 1 && (
              <Text className="create-home__dock-cost typo-meta">
                {c.dockCostHint.replace("{n}", String(creditCost))}
              </Text>
            )}
            <Text className="create-home__ai-note typo-meta">
              {copy.legalUi.aiGeneratedNotice}
            </Text>
          </View>
        </View>
        )}
      </View>

      <CoachMarks page="create" onVisibilityChange={setCoachOpen} suppressed={!!activeJobId || submitting} />

      <BottomSheet open={moreModesOpen} title={c.moreModesLabel} onClose={() => setMoreModesOpen(false)}>
        <ModeTileGrid items={moreModeTiles} activeId={mode} layout="grid" onSelect={handleModeSelect} />
      </BottomSheet>

      <BottomSheet
        open={advancedOpen}
        title={c.advancedSheetTitle}
        onClose={() => setAdvancedOpen(false)}
        footer={
          <View className="create-home__sheet-footer">
            <Button variant="secondary" size="sm" block loading={savingDraft} onClick={saveDraft}>
              {c.saveDraft}
            </Button>
            <Button variant="primary" size="sm" block onClick={openCopilot}>
              {c.copilotLink}
            </Button>
          </View>
        }
      >
        <CreateModePicker value={mode} onChange={(next) => { setMode(next); setCoverStep("pick"); }} />
        {(mode === "quickTrack" || mode === "playlist") && (
          <ReferenceTrackPicker
            works={pickerWorks}
            selectedId={referenceWorkId}
            avOffset={referenceAvOffset}
            onSelect={setReferenceWorkId}
            onOffsetChange={setReferenceAvOffset}
          />
        )}
        {mode === "variation" && (
          <Button variant="secondary" size="sm" block onClick={() => openStackPage("/packageStudio/pages/variation-lab/index")}>
            {copy.variationLabUi.title}
          </Button>
        )}
        {mode === "lyrics" && (
          <>
            <TextArea
              label={c.lyricsLabel}
              placeholder={c.lyricsPlaceholder}
              value={lyrics}
              onInput={(e) => setLyrics(e.detail.value)}
              maxlength={2000}
            />
            <Button variant="secondary" size="sm" loading={generatingLyrics} onClick={generateLyricsAi}>
              {c.generateLyrics}
            </Button>
          </>
        )}
        {mode === "cover" && coverStep === "generate" && (
          <TextArea
            label={c.lyricsLabel}
            value={coverLyrics}
            onInput={(e) => setCoverLyrics(e.detail.value)}
            maxlength={2000}
          />
        )}
        {needsSeed && (
          <Suspense fallback={<LoadingSkeleton count={2} />}>
            <WorkPicker
              value={seedWorkId}
              onChange={(id, title) => {
                setSeedWorkId(id);
                if (title) setItem("create:seedTitle", title);
                setCoverStep("pick");
              }}
            />
          </Suspense>
        )}
      </BottomSheet>

      <BottomSheet open={draftsOpen} title={c.draftsLabel} onClose={() => setDraftsOpen(false)}>
        {drafts.length === 0 && <Text className="typo-meta">{c.draftsLabel}</Text>}
        {drafts.map((d) => (
          <View key={d.id} className="create-draft-row">
            <Button variant="ghost" block onClick={() => applyDraft(d)}>
              {d.title} · {d.mode}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => removeDraft(d.id)}>
              {c.deleteDraft}
            </Button>
          </View>
        ))}
      </BottomSheet>

      <Suspense fallback={null}>
        <CreditsPaywallSheet
          open={paywallOpen}
          requiredCredits={paywallCredits}
          source={paywallSource}
          initialTab={paywallTab}
          returnPath="/pages/create/index"
          onClose={() => setPaywallOpen(false)}
          onSuccess={() => {
            setPaywallOpen(false);
            void generate();
          }}
        />
      </Suspense>

      <WorkTitleSheet
        open={titleSheetOpen}
        sheetTitle={c.workTitleSheetTitle}
        body={c.workTitleSheetBody}
        label={c.workTitleLabel}
        placeholder={c.workTitlePlaceholder}
        hint={c.workTitleHint}
        suggestLabel={c.workTitleSheetSuggest}
        suggestedTitle={suggestedTitleForSheet}
        skipLabel={c.workTitleSheetSkip}
        confirmLabel={c.workTitleSheetConfirm}
        title={titleDraft}
        loading={submitting}
        onTitleChange={setTitleDraft}
        onUseSuggested={() => setTitleDraft(suggestedTitleForSheet)}
        onSkip={() => void requestGenerate("")}
        onConfirm={() => void requestGenerate(titleDraft)}
        onClose={() => setTitleSheetOpen(false)}
      />
      <AiDisclaimerSheet
        open={aiDisclaimerOpen}
        loading={aiConsentLoading}
        onClose={() => setAiDisclaimerOpen(false)}
        onConfirm={() => void confirmAiDisclaimer()}
      />
    </PageShell>
  );
}
