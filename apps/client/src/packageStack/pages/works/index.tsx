import { useMemo, useState, useEffect, lazy, Suspense } from "react";
import { View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh, useRouter } from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { workToPlayerTrack } from "@vibe-sorcery/types";
import { PageShell } from "../../../components/PageShell";
import { WorkRow } from "../../../components/community/WorkRow";
import { WorkCoverCard } from "../../../components/community/WorkCoverCard";
import { PublishDialog } from "../../../components/community/PublishDialog";
import { RenameWorkSheet, type RenameWorkTarget } from "../../../components/community/RenameWorkSheet";
import { CelebrationSheet } from "../../../components/ui";
import type { DerivativeMode } from "../../../components/studio/DerivativeSheet";
import { AuthBanner, Button, ChipGroup, EmptyState, LoadingSkeleton, showSuccess, showError, ViewModeToggle } from "../../../components/ui";
import { vibeApi, type Work } from "../../../services/api";
import { bootstrapAuth, isLoggedIn, requireAuth } from "../../../utils/auth";
import { useCreditsOptional } from "../../../contexts/CreditsProvider";
import { usePlayerTransport } from "../../../contexts/PlayerProvider";
import { syncAfterFeedMutation } from "../../../utils/feedMutationSync";
import { copyEmbedLink } from "../../../platform/share";
import { uploadFile } from "../../../platform/upload";
import { filterWorks, isWorkPublished, openWorkDetail, parseWorkFilter, type WorkFilter } from "../../../utils/workNav";
import "./index.scss";

const LazyDerivativeSheet = lazy(() =>
  import("../../../components/studio/DerivativeSheet").then((m) => ({ default: m.DerivativeSheet }))
);

type ViewMode = "grid" | "list";
type ExtendedWork = Work & { visibility?: string; parent_work_id?: string; version?: number };
type PostMeta = { postId: string; caption?: string | null };

export default function WorksPage() {
  const router = useRouter();
  const { copy } = useLocale();
  const w = copy.worksUi;
  const creditsCtx = useCreditsOptional();
  const { patchTrackTitle } = usePlayerTransport();
  const [works, setWorks] = useState<ExtendedWork[]>([]);
  const [postByWork, setPostByWork] = useState<Record<string, PostMeta>>({});
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("newest");
  const [filter, setFilter] = useState<WorkFilter>("all");
  const [view, setView] = useState<ViewMode>("grid");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [publishTarget, setPublishTarget] = useState<ExtendedWork | null>(null);
  const [renameTarget, setRenameTarget] = useState<RenameWorkTarget | null>(null);
  const [celebrateOpen, setCelebrateOpen] = useState(false);
  const [derivative, setDerivative] = useState<{ work: ExtendedWork; mode: DerivativeMode } | null>(null);
  const isH5 = process.env.TARO_ENV === "h5";

  useDidShow(() => {
    setFilter(parseWorkFilter(router.params.filter));
    void loadWorks();
  });

  usePullDownRefresh(loadWorks);

  async function loadWorks() {
    bootstrapAuth();
    if (!isLoggedIn()) {
      setWorks([]);
      setLoading(false);
      Taro.stopPullDownRefresh();
      return;
    }
    setLoading(true);
    try {
      const me = await vibeApi.me();
      const [list, feed] = await Promise.all([
        vibeApi.listWorks(sort),
        vibeApi.getFeed("latest").catch(() => []),
      ]);
      setWorks(list as ExtendedWork[]);
      const map: Record<string, PostMeta> = {};
      feed.forEach((p) => {
        if (p.work?.id && p.author_username === me.username) {
          map[p.work.id] = { postId: p.id, caption: p.caption ?? null };
        }
      });
      setPostByWork(map);
    } catch {
      showError(w.loadFail);
    } finally {
      setLoading(false);
      Taro.stopPullDownRefresh();
    }
  }

  useEffect(() => {
    if (isLoggedIn()) void loadWorks();
  }, [sort]);

  const publishedCount = useMemo(
    () => works.filter((item) => isWorkPublished(item, postByWork)).length,
    [works, postByWork]
  );

  const visibleWorks = useMemo(
    () => filterWorks(works, filter, postByWork),
    [works, filter, postByWork]
  );

  const queue = useMemo(
    () => visibleWorks.map((item) => workToPlayerTrack(item, { source: "works" })),
    [visibleWorks]
  );

  async function publishWork(
    workId: string,
    caption: string,
    opts?: { allowRemix: boolean; license: string; contentComplianceAcknowledged?: boolean },
  ) {
    if (!requireAuth()) return;
    const post = await vibeApi.createPost(workId, caption, {
      allow_remix: opts?.allowRemix,
      license: opts?.license,
      content_compliance_acknowledged: opts?.contentComplianceAcknowledged ?? true,
    });
    setPostByWork((prev) => ({ ...prev, [workId]: { postId: post.id || "", caption: post.caption ?? null } }));
    await syncAfterFeedMutation(creditsCtx, post);
    showSuccess(w.publishSuccess);
    setCelebrateOpen(true);
    void loadWorks();
  }

  async function unpublishWork(workId: string) {
    const postId = postByWork[workId]?.postId;
    if (!postId) return;
    const ok = await Taro.showModal({ title: w.unpublish, content: w.unpublishConfirm });
    if (!ok.confirm) return;
    try {
      await vibeApi.deletePost(postId);
      await syncAfterFeedMutation(creditsCtx);
      setPostByWork((prev) => {
        const next = { ...prev };
        delete next[workId];
        return next;
      });
      showSuccess(w.unpublishSuccess);
      void loadWorks();
    } catch {
      showError(w.deleteFail);
    }
  }

  async function batchDelete() {
    if (selected.size === 0) return;
    const ok = await Taro.showModal({
      title: w.deleteSelected.replace("{n}", String(selected.size)),
      content: w.deleteConfirm.replace("{n}", String(selected.size)),
    });
    if (!ok.confirm) return;
    try {
      await vibeApi.batchDeleteWorks([...selected]);
      showSuccess(w.deleteSuccess);
      setSelected(new Set());
      setSelectMode(false);
      void loadWorks();
    } catch {
      showError(w.deleteFail);
    }
  }

  async function generateCover(workId: string) {
    try {
      await vibeApi.generateCoverImage(workId);
      showSuccess(w.coverSuccess);
      void loadWorks();
    } catch {
      showError(w.deleteFail);
    }
  }

  async function uploadCover(workId: string) {
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
      await uploadFile("/studio/cover-upload", filePath, "file", { work_id: workId });
      Taro.hideLoading();
      showSuccess(w.coverUploaded);
      void loadWorks();
    } catch {
      Taro.hideLoading();
      showError(w.coverUploadFail);
    }
  }

  async function triggerPostProcess(workId: string) {
    try {
      await vibeApi.triggerPostProcess(workId);
      showSuccess(w.postProcessQueued);
    } catch {
      showError(w.deleteFail);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleRenameSaved(result: { id: string; title: string; version: number; postCaptionSynced: boolean }) {
    setWorks((prev) =>
      prev.map((w) => (w.id === result.id ? { ...w, title: result.title, version: result.version } : w)),
    );
    patchTrackTitle(result.id, result.title);
    if (result.postCaptionSynced) {
      setPostByWork((prev) => {
        const meta = prev[result.id];
        if (!meta) return prev;
        return { ...prev, [result.id]: { ...meta, caption: result.title } };
      });
    }
  }

  function workProps(item: ExtendedWork) {
    const postMeta = postByWork[item.id];
    const postId = postMeta?.postId ?? null;
    const published = isWorkPublished(item, postByWork);
    return {
      id: item.id,
      title: item.title,
      moods: item.moods,
      coverUrl: item.cover_url,
      c2paVerified: item.c2pa_verified,
      hlsReady: !!item.hls_url,
      published,
      postId,
      postProcessStatus: item.post_process_status,
      track: item.audio_url ? workToPlayerTrack(item, { source: "works" }) : undefined,
      queue,
      selectMode,
      selected: selected.has(item.id),
      onSelect: () => toggleSelect(item.id),
      onOpen: selectMode ? undefined : () => openWorkDetail(item.id),
      onPublish: !postId && !selectMode ? () => setPublishTarget(item) : undefined,
      onUnpublish: postId && !selectMode ? () => unpublishWork(item.id) : undefined,
      onRemix: selectMode ? undefined : () => setDerivative({ work: item, mode: "remix" }),
      onCover: selectMode ? undefined : () => setDerivative({ work: item, mode: "cover" }),
      onGenerateCover: selectMode ? undefined : () => generateCover(item.id),
      onUploadCover: selectMode ? undefined : () => uploadCover(item.id),
      onPostProcess: selectMode ? undefined : () => triggerPostProcess(item.id),
      onEmbed: isH5 && !selectMode ? () => copyEmbedLink(item.id) : undefined,
      onRename:
        !selectMode
          ? () =>
              setRenameTarget({
                id: item.id,
                title: item.title,
                version: item.version,
                postId,
                postCaption: postMeta?.caption ?? null,
              })
          : undefined,
    };
  }

  const subtitle =
    works.length > 0
      ? w.subtitleWithPublished.replace("{n}", String(works.length)).replace("{m}", String(publishedCount))
      : undefined;

  if (!isLoggedIn()) {
    return (
      <PageShell label={copy.nav.works} title={copy.pages.works.title} subtitle={w.loginSubtitle} ambient wide>
        <AuthBanner message={copy.settingsUi.authBanner} loginLabel={copy.loginUi.login} />
        <Button variant="primary" block className="auth-gate__cta" onClick={() => requireAuth()}>
          {copy.loginUi.login}
        </Button>
      </PageShell>
    );
  }

  return (
    <PageShell
      label={copy.nav.works}
      title={copy.pages.works.title}
      subtitle={subtitle}
      wide
      ambient
      actions={
        <Button size="sm" variant="ghost" onClick={() => { setSelectMode(!selectMode); setSelected(new Set()); }}>
          {selectMode ? copy.actions.cancel : w.selectMode}
        </Button>
      }
    >
      <View className="works-toolbar">
        <ChipGroup
          options={[
            { value: "all", label: w.filterAll },
            { value: "draft", label: w.filterDraft },
            { value: "published", label: w.filterPublished },
            { value: "derivative", label: w.filterDerivative },
          ]}
          value={filter}
          onChange={(v) => setFilter(v as WorkFilter)}
        />
      </View>
      <View className="works-toolbar works-toolbar--secondary">
        <ChipGroup
          options={[
            { value: "newest", label: copy.discoverUi.sortLatest },
            { value: "oldest", label: w.sortOldest },
          ]}
          value={sort}
          onChange={setSort}
        />
        <ViewModeToggle
          options={[
            { value: "grid", icon: "grid", label: w.viewGrid },
            { value: "list", icon: "list", label: w.viewList },
          ]}
          value={view}
          onChange={(v) => setView(v as ViewMode)}
        />
      </View>
      {selectMode && selected.size > 0 && (
        <Button variant="danger" block onClick={batchDelete} className="works-batch-delete">
          {w.deleteSelected.replace("{n}", String(selected.size))}
        </Button>
      )}
      {loading && <LoadingSkeleton count={4} variant="line" />}
      {!loading && visibleWorks.length === 0 && (
        <EmptyState
          iconName="music"
          title={w.emptyTitle}
          description={w.emptyDesc}
          actionLabel={w.actionLabel}
          onAction={() => Taro.switchTab({ url: "/pages/create/index" })}
        />
      )}
      {view === "grid" ? (
        <View className="works-grid">
          {visibleWorks.map((item) => (
            <View key={item.id} className="works-grid__cell">
              <WorkCoverCard {...workProps(item)} />
            </View>
          ))}
        </View>
      ) : (
        <View className="works-list">
          {visibleWorks.map((item) => {
            const p = workProps(item);
            return (
              <WorkRow
                key={item.id}
                id={p.id}
                title={p.title}
                moods={p.moods}
                coverUrl={p.coverUrl}
                c2paVerified={p.c2paVerified}
                hlsReady={p.hlsReady}
                published={p.published}
                postId={p.postId}
                postProcessStatus={p.postProcessStatus}
                track={p.track}
                queue={p.queue}
                onOpen={p.onOpen}
                onPublish={p.onPublish}
                onUnpublish={p.onUnpublish}
                onRemix={p.onRemix}
                onCover={p.onCover}
                onGenerateCover={p.onGenerateCover}
                onPostProcess={p.onPostProcess}
                onEmbed={p.onEmbed}
                onRename={p.onRename}
              />
            );
          })}
        </View>
      )}
      {!loading && visibleWorks.length > 0 && (
        <Button variant="secondary" block onClick={() => Taro.switchTab({ url: "/pages/create/index" })} className="works-continue">
          {w.continueCreate}
        </Button>
      )}
      {renameTarget && (
        <RenameWorkSheet
          target={renameTarget}
          onClose={() => setRenameTarget(null)}
          onSaved={handleRenameSaved}
        />
      )}
      {publishTarget && (
        <PublishDialog
          workTitle={publishTarget.title}
          onClose={() => setPublishTarget(null)}
          onPublish={(caption, opts) => publishWork(publishTarget.id, caption, opts)}
        />
      )}
      <CelebrationSheet open={celebrateOpen} variant="publish" onClose={() => setCelebrateOpen(false)} />
      {derivative && (
        <Suspense fallback={null}>
          <LazyDerivativeSheet
            workId={derivative.work.id}
            workTitle={derivative.work.title}
            initialMode={derivative.mode}
            onClose={() => setDerivative(null)}
          />
        </Suspense>
      )}
    </PageShell>
  );
}
