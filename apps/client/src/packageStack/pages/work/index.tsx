import { useState, lazy, Suspense, useEffect } from "react";
import { View, Text, Image } from "@tarojs/components";
import Taro, { useRouter, useDidShow, useShareAppMessage } from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { workToPlayerTrack } from "@vibe-sorcery/types";
import { PageShell } from "../../../components/PageShell";
import { PublishDialog } from "../../../components/community/PublishDialog";
import { CommunityPostButton } from "../../../components/community/CommunityPostButton";
import { AiGeneratedBadge } from "../../../components/legal/AiGeneratedBadge";
import { RenameWorkSheet, type RenameWorkTarget } from "../../../components/community/RenameWorkSheet";
import type { DerivativeMode } from "../../../components/studio/DerivativeSheet";
import { ActionIconBar, Badge, BottomSheet, Button, Collapsible, Icon, Input, LoadingSkeleton, PostProcessBadges, ShareButton, Tag, showError, showSuccess, type ActionIconItem } from "../../../components/ui";
import { PlayTrackButton } from "../../../components/player/PlayTrackButton";
import { WorkLightEditor } from "../../../components/studio/WorkLightEditor";
import { MoodVisualPreview } from "../../../components/studio/MoodVisualPreview";
import { MemberExportQuotas } from "../../../components/commercial/MemberExportQuotas";
import { TipSheet } from "../../../components/commercial/TipSheet";
import { saveVideoFromUrl } from "../../../platform/media";
import { vibeApi } from "../../../services/api";
import { bootstrapAuth, requireAuth } from "../../../utils/auth";
import { useCreditsOptional } from "../../../contexts/CreditsProvider";
import { usePlayerTransport } from "../../../contexts/PlayerProvider";
import { syncAfterFeedMutation } from "../../../utils/feedMutationSync";
import { copyEmbedLink, shareWork, workSharePayload } from "../../../platform/share";
import { uploadFile } from "../../../platform/upload";
import { setItem } from "../../../platform/storage";
import { openWorkDetail } from "../../../utils/workNav";
import { socialPage, STUDIO_PAGE_ROUTES } from "../../../constants/routes";
import { canRemixWork } from "../../../utils/remixLicense";
import "./index.scss";

const LazyDerivativeSheet = lazy(() =>
  import("../../../components/studio/DerivativeSheet").then((m) => ({ default: m.DerivativeSheet }))
);

type WorkDetail = {
  id: string;
  title: string;
  description?: string;
  audio_url: string;
  hls_url?: string;
  cover_url?: string;
  moods?: string[];
  duration?: number;
  visibility?: string;
  parent_work_id?: string;
  arousal?: number;
  valence?: number;
  c2pa_verified?: boolean;
  post_process_status?: Record<string, unknown>;
  allow_remix?: boolean;
  license?: string;
  version?: number;
};

export default function WorkDetailPage() {
  const router = useRouter();
  const workId = router.params.workId || "";
  const { copy } = useLocale();
  const d = copy.workDetailUi;
  const w = copy.worksUi;
  const a = copy.actions;
  const creditsCtx = useCreditsOptional();
  const { patchTrackTitle } = usePlayerTransport();
  const isH5 = process.env.TARO_ENV === "h5";

  const [work, setWork] = useState<WorkDetail | null>(null);

  useShareAppMessage(() =>
    work ? workSharePayload(work.id, work.title) : { title: copy.brand.name }
  );

  const [postId, setPostId] = useState<string | null>(null);
  const [postCaption, setPostCaption] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<RenameWorkTarget | null>(null);
  const [derivatives, setDerivatives] = useState<Array<{ id: string; title: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [publishOpen, setPublishOpen] = useState(false);
  const [derivative, setDerivative] = useState<{ mode: DerivativeMode } | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [showMoodVisual, setShowMoodVisual] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const [duelSheetOpen, setDuelSheetOpen] = useState(false);
  const [duelOpponent, setDuelOpponent] = useState("");
  const [duelQuota, setDuelQuota] = useState<{ member_free_remaining?: number; pass_starts_remaining?: number; start_cost?: number } | null>(null);
  const [duelStarting, setDuelStarting] = useState(false);
  const [publicTips, setPublicTips] = useState<Array<{ username: string; credits: number; message?: string }>>([]);
  const [myUsername, setMyUsername] = useState<string | null>(null);
  const [authorUsername, setAuthorUsername] = useState<string | null>(null);
  const [remixChain, setRemixChain] = useState<{ chain_label: string; direct_remixes: number; generation_depth: number } | null>(null);
  const [engagementStats, setEngagementStats] = useState<{ listen_completes: number; resonance_avg: number } | null>(null);
  const eco = copy.ecosystemUi;
  const social = copy.socialUi;
  const mv = copy.moodVisualUi;

  useDidShow(() => {
    if (!workId) return;
    bootstrapAuth();
    setLoading(true);
    Promise.all([
      vibeApi.getWork(workId) as Promise<WorkDetail>,
      vibeApi.me().then((me) => {
        setMyUsername(me.username);
        return vibeApi.getFeed("latest").then((feed) => {
          const post = feed.find((p) => p.work?.id === workId);
          if (post) {
            setAuthorUsername(post.author_username);
            if (post.author_username === me.username) {
              return { id: post.id, caption: post.caption ?? null };
            }
          }
          return null;
        });
      }),
      vibeApi.getDerivatives(workId).catch(() => []),
      vibeApi.getRemixChain(workId).catch(() => null),
      vibeApi.getPublicTips(workId).catch(() => ({ tips: [] })),
      vibeApi.getWorkEngagementStats(workId).catch(() => null),
    ])
      .then(([detail, postMeta, derivs, chain, tipsRes, stats]) => {
        setWork(detail);
        setPostId(postMeta?.id || null);
        setPostCaption(postMeta?.caption ?? null);
        setDerivatives(derivs);
        if (chain) {
          setRemixChain({
            chain_label: chain.chain_label,
            direct_remixes: chain.direct_remixes,
            generation_depth: chain.generation_depth,
          });
        }
        setPublicTips(tipsRes.tips || []);
        if (stats) setEngagementStats({ listen_completes: stats.listen_completes, resonance_avg: stats.resonance_avg });
      })
      .catch(() => showError(d.loadFail))
      .finally(() => setLoading(false));
  });

  const published = work?.visibility === "public" || !!postId;
  const track = work?.audio_url ? workToPlayerTrack(work, { source: "works" }) : undefined;

  async function publishWork(caption: string, opts: { allowRemix: boolean; license: string }) {
    if (!work || !requireAuth()) return;
    const post = await vibeApi.createPost(work.id, caption, {
      allow_remix: opts.allowRemix,
      license: opts.license,
      content_compliance_acknowledged: true,
    });
    setPostId(post.id || "1");
    await syncAfterFeedMutation(creditsCtx, post);
    showSuccess(w.publishSuccess);
    setPublishOpen(false);
  }

  async function unpublishWork() {
    if (!postId) return;
    const ok = await Taro.showModal({ title: w.unpublish, content: w.unpublishConfirm });
    if (!ok.confirm) return;
    try {
      await vibeApi.deletePost(postId);
      await syncAfterFeedMutation(creditsCtx);
      setPostId(null);
      showSuccess(w.unpublishSuccess);
    } catch {
      showError(w.deleteFail);
    }
  }

  async function deleteWork() {
    if (!work) return;
    const ok = await Taro.showModal({ title: d.deleteWork, content: d.deleteConfirm });
    if (!ok.confirm) return;
    try {
      await vibeApi.batchDeleteWorks([work.id]);
      showSuccess(w.deleteSuccess);
      Taro.navigateBack();
    } catch {
      showError(w.deleteFail);
    }
  }

  async function generateCover() {
    if (!work) return;
    try {
      await vibeApi.generateCoverImage(work.id);
      await creditsCtx?.refresh();
      showSuccess(w.coverSuccess);
      const refreshed = (await vibeApi.getWork(work.id)) as WorkDetail;
      setWork(refreshed);
    } catch {
      showError(w.deleteFail);
    }
  }

  async function uploadCover() {
    if (!work) return;
    let filePath: string | undefined;
    try {
      const pick = await Taro.chooseImage({ count: 1, sizeType: ["compressed"] });
      filePath = pick.tempFilePaths?.[0];
    } catch {
      return;
    }
    if (!filePath) return;
    try {
      Taro.showLoading({ title: w.coverUploading, mask: true });
      await uploadFile("/studio/cover-upload", filePath, "file", { work_id: work.id });
      Taro.hideLoading();
      showSuccess(w.coverUploaded);
      const refreshed = (await vibeApi.getWork(work.id)) as WorkDetail;
      setWork(refreshed);
    } catch {
      Taro.hideLoading();
      showError(w.coverUploadFail);
    }
  }

  async function triggerPostProcess() {
    if (!work) return;
    try {
      await vibeApi.triggerPostProcess(work.id);
      showSuccess(w.postProcessQueued);
    } catch {
      showError(w.deleteFail);
    }
  }

  async function doExportMv() {
    if (!work || !requireAuth()) return;
    setExporting("mv_video");
    try {
      const res = await vibeApi.exportMoodVisual(work.id);
      await creditsCtx?.refresh();
      if (process.env.TARO_ENV === "weapp") {
        await saveVideoFromUrl(res.download_url);
        showSuccess(mv.saveVideoSuccess);
      } else {
        await saveVideoFromUrl(res.download_url);
        showSuccess(mv.exportSuccess);
      }
    } catch {
      showError(mv.exportFail);
    } finally {
      setExporting(null);
    }
  }

  async function doExport(exportType: "hq_mp3" | "hq_wav" | "stems" | "commercial_license") {
    if (!work || !requireAuth()) return;
    if (exportType === "hq_wav" || exportType === "stems") {
      showError(exportType === "hq_wav" ? eco.exportWavComingSoon : eco.exportStemsComingSoon);
      return;
    }
    setExporting(exportType);
    try {
      const res = await vibeApi.exportWork(work.id, exportType);
      await creditsCtx?.refresh();
      if (res.license_id) {
        showSuccess(`${eco.exportSuccess}: ${res.license_id}`);
      } else {
        showSuccess(eco.exportSuccess);
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "status" in err && (err as { status?: number }).status === 501
          ? eco.exportComingSoon
          : eco.exportFail;
      showError(msg);
    } finally {
      setExporting(null);
    }
  }

  function continueFromWork() {
    if (!work) return;
    setItem("create:seedWorkId", work.id);
    Taro.switchTab({ url: "/pages/create/index" });
  }

  async function refreshPublicTips() {
    if (!work?.id) return;
    const tipsRes = await vibeApi.getPublicTips(work.id).catch(() => ({ tips: [] }));
    setPublicTips(tipsRes.tips || []);
  }

  const canTip = !!authorUsername && !!myUsername && authorUsername !== myUsername;

  function goBack() {
    Taro.navigateBack().catch(() => Taro.switchTab({ url: "/pages/profile/index" }));
  }

  async function openDuelSheet() {
    if (!requireAuth() || !workId || !postId) {
      showError(social.duelStartFail);
      return;
    }
    setDuelSheetOpen(true);
    const q = await vibeApi.getDuelQuota().catch(() => null);
    setDuelQuota(q);
  }

  async function startDuel() {
    if (!requireAuth() || !workId || !postId) {
      showError(social.duelStartFail);
      return;
    }
    setDuelStarting(true);
    try {
      const opponent = duelOpponent.trim().replace(/^@/, "") || undefined;
      const res = await vibeApi.createDuel(workId, opponent);
      showSuccess(social.duelStarted);
      setDuelSheetOpen(false);
      setDuelOpponent("");
      Taro.navigateTo({ url: socialPage("duel", { id: res.duel_id }) });
    } catch {
      showError(social.duelStartFail);
    } finally {
      setDuelStarting(false);
    }
  }

  function buildActionItems(detail: WorkDetail): ActionIconItem[] {
    const items: ActionIconItem[] = [];
    items.push({
      id: "rename",
      icon: "create",
      label: w.renameAction,
      onClick: () =>
        setRenameTarget({
          id: detail.id,
          title: detail.title,
          version: detail.version,
          postId,
          postCaption,
        }),
    });
    if (canRemixWork(detail)) {
      items.push({ id: "remix", icon: "remix", label: copy.derivative.remix.short, onClick: () => setDerivative({ mode: "remix" }) });
    }
    items.push(
      { id: "cover", icon: "music", label: copy.derivative.cover.short, onClick: () => setDerivative({ mode: "cover" }) },
      { id: "prov", icon: "search", label: d.viewProvenance, onClick: () => Taro.navigateTo({ url: `/pages/provenance/index?workId=${workId}` }) }
    );
    return items;
  }

  return (
    <PageShell title={work?.title || d.title} wide ambient hideHeader noPadTop>
      <View className="work-detail">
        <View className="work-detail__header">
          <View className="work-detail__back" onClick={goBack}>
            <Icon name="chevronLeft" size="sm" accent />
            <Text>{d.back}</Text>
          </View>
          <View className="work-detail__header-actions">
            {work && (
              <ShareButton className="work-detail__icon-btn" onShare={() => shareWork(work.id, work.title)}>
                <Icon name="share" size="sm" />
              </ShareButton>
            )}
          </View>
        </View>

        {loading && <LoadingSkeleton count={3} />}
        {!loading && work && (
          <>
            <View className="work-detail__hero">
              {work.cover_url ? (
                <Image className="work-detail__cover" src={work.cover_url} mode="aspectFill" />
              ) : (
                <View className="work-detail__cover work-detail__cover--fallback">
                  <Icon name="music" size="xl" accent />
                </View>
              )}
              {track && (
                <View className="work-detail__play">
                  <PlayTrackButton track={track} />
                </View>
              )}
            </View>

            <Text className="work-detail__title">{work.title}</Text>
            {work.moods?.length ? (
              <Text className="work-detail__moods">{work.moods.join(" · ")}</Text>
            ) : null}
            <View className="work-detail__badges">
              <AiGeneratedBadge />
              {published ? <Badge tone="accent">{w.published}</Badge> : <Tag>{d.private}</Tag>}
              {work.c2pa_verified && <Badge tone="success">{copy.provenanceUi.verified}</Badge>}
            </View>
            <PostProcessBadges status={work.post_process_status} c2paVerified={work.c2pa_verified} onRetry={triggerPostProcess} />

            <View className="work-detail__community">
              {remixChain && (
                <Text
                  className="work-detail__chain work-detail__chain--link"
                  onClick={() => Taro.navigateTo({ url: `${STUDIO_PAGE_ROUTES.provenance}?workId=${workId}` })}
                >
                  {social.remixChain}: {remixChain.chain_label}
                  {remixChain.direct_remixes > 0 ? ` · ${remixChain.direct_remixes} Remix` : ""}
                  {remixChain.generation_depth > 0 ? ` · ${social.viewLineage}` : ""}
                </Text>
              )}
              {engagementStats && (engagementStats.listen_completes > 0 || engagementStats.resonance_avg > 0) && (
                <Text className="work-detail__engagement-stats">
                  {social.workListenCompletes.replace("{n}", String(engagementStats.listen_completes))}
                  {engagementStats.resonance_avg > 0
                    ? ` · ${social.workResonanceAvg.replace("{n}", String(Math.round(engagementStats.resonance_avg * 100)))}`
                    : ""}
                </Text>
              )}
              <CommunityPostButton
                postId={postId}
                published={!!postId}
                onPublish={() => setPublishOpen(true)}
                block
              />
              {canTip && (
                <Button variant="ghost" size="sm" block onClick={() => setTipOpen(true)}>
                  {eco.tipTitle}
                </Button>
              )}
              {publicTips.length > 0 && (
                <View className="work-detail__tips-feed">
                  <Text className="work-detail__tips-title">{social.publicTipsTitle}</Text>
                  {publicTips.slice(0, 5).map((t, i) => (
                    <Text key={i} className="work-detail__tips-line">
                      @{t.username} +{t.credits}
                      {t.message ? `：${t.message}` : ""}
                    </Text>
                  ))}
                </View>
              )}
              {postId && myUsername && (
                <Button variant="secondary" size="sm" block onClick={() => void openDuelSheet()}>
                  {social.startDuel}
                </Button>
              )}
              {postId && (
                <Text className="work-detail__unpublish" onClick={unpublishWork}>
                  {w.unpublish}
                </Text>
              )}
            </View>

            <View className="work-detail__actions">
              <ActionIconBar items={buildActionItems(work)} />
            </View>

            <View className="work-detail__cta-row">
              <Button variant="secondary" size="sm" block onClick={continueFromWork}>
                {d.continueFrom}
              </Button>
              {/* Cover controls only make sense for the owner. `canTip` is true only
                  when viewing someone else's work, so hide them in that case (own
                  drafts have no author link and still show). */}
              {!canTip && !work.cover_url && (
                <Button variant="ghost" size="sm" block onClick={generateCover}>
                  {w.generateCover}
                </Button>
              )}
              {!canTip && (
                <Button variant="ghost" size="sm" block onClick={uploadCover}>
                  {w.coverUpload}
                </Button>
              )}
              {isH5 && (
                <Button variant="ghost" size="sm" block onClick={() => copyEmbedLink(work.id)}>
                  Embed
                </Button>
              )}
            </View>

            <WorkLightEditor
              workId={work.id}
              title={work.title}
              arousal={work.arousal}
              valence={work.valence}
            />

            <Collapsible label={mv.title} storageKey={`work-mv-${workId}`}>
              {!showMoodVisual && (
                <Button variant="secondary" size="sm" block onClick={() => setShowMoodVisual(true)}>
                  {mv.preview}
                </Button>
              )}
              {showMoodVisual && (
                <MoodVisualPreview workId={work.id} onClose={() => setShowMoodVisual(false)} />
              )}
            </Collapsible>

            <Collapsible label={eco.exportTitle} storageKey={`work-export-${workId}`}>
              <MemberExportQuotas />
              <View className="work-detail__cta-row">
                <Button variant="secondary" size="sm" loading={exporting === "hq_mp3"} onClick={() => void doExport("hq_mp3")}>
                  {eco.exportHq}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void doExport("hq_wav")}>
                  {eco.exportWav} · {eco.exportComingSoon}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void doExport("stems")}>
                  {eco.exportStems} · {eco.exportComingSoon}
                </Button>
                <Button variant="ghost" size="sm" loading={exporting === "commercial_license"} onClick={() => void doExport("commercial_license")}>
                  {eco.exportCommercial}
                </Button>
                <Button variant="ghost" size="sm" loading={exporting === "mv_video"} onClick={() => void doExportMv()}>
                  {mv.exportMp4}
                </Button>
              </View>
            </Collapsible>

            <Collapsible label={d.archive} storageKey={`work-archive-${workId}`}>
              {work.description && <Text className="work-detail__meta">{work.description}</Text>}
              {(work.arousal != null || work.valence != null) && (
                <Text className="work-detail__meta">
                  Arousal {work.arousal ?? "—"} · Valence {work.valence ?? "—"}
                </Text>
              )}
              {work.parent_work_id && (
                <Text className="work-detail__link" onClick={() => openWorkDetail(work.parent_work_id!)}>
                  {d.parentWork} →
                </Text>
              )}
            </Collapsible>

            <Collapsible label={d.derivatives} storageKey={`work-deriv-${workId}`} defaultOpen>
              {derivatives.length === 0 && <Text className="typo-meta">{d.noDerivatives}</Text>}
              {derivatives.map((item) => (
                <View key={item.id} className="work-detail__deriv-row" onClick={() => openWorkDetail(item.id)}>
                  <Icon name="remix" size="sm" accent />
                  <Text className="work-detail__deriv-title">{item.title}</Text>
                </View>
              ))}
            </Collapsible>

            <Button variant="danger" block className="work-detail__delete" onClick={deleteWork}>
              {d.deleteWork}
            </Button>
          </>
        )}
      </View>

      {renameTarget && (
        <RenameWorkSheet
          target={renameTarget}
          onClose={() => setRenameTarget(null)}
          onSaved={(result) => {
            setWork((prev) => (prev ? { ...prev, title: result.title, version: result.version } : prev));
            patchTrackTitle(result.id, result.title);
            if (result.postCaptionSynced) setPostCaption(result.title);
          }}
        />
      )}
      {publishOpen && work && (
        <PublishDialog workTitle={work.title} onClose={() => setPublishOpen(false)} onPublish={publishWork} />
      )}
      {derivative && work && (
        <Suspense fallback={null}>
          <LazyDerivativeSheet
            workId={work.id}
            workTitle={work.title}
            initialMode={derivative.mode}
            onClose={() => setDerivative(null)}
          />
        </Suspense>
      )}
      {work && (
        <TipSheet
          open={tipOpen}
          workId={work.id}
          workTitle={work.title}
          onClose={() => setTipOpen(false)}
          onDone={() => void refreshPublicTips()}
        />
      )}
      <BottomSheet open={duelSheetOpen} title={social.startDuel} onClose={() => setDuelSheetOpen(false)}>
        {duelQuota ? (
          <Text className="work-detail__duel-quota">
            {social.duelQuotaHint
              .replace("{free}", String(duelQuota.member_free_remaining ?? 0))
              .replace("{pass}", String(duelQuota.pass_starts_remaining ?? 0))
              .replace("{cost}", String(duelQuota.start_cost ?? 1))}
          </Text>
        ) : null}
        <Input
          label={social.duelOpponentLabel}
          placeholder={social.duelOpponentPlaceholder}
          value={duelOpponent}
          onInput={(e) => setDuelOpponent(e.detail.value)}
        />
        <Button variant="primary" block loading={duelStarting} onClick={() => void startDuel()}>
          {social.startDuel}
        </Button>
      </BottomSheet>
    </PageShell>
  );
}
