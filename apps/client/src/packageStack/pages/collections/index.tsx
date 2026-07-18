import { useEffect, useMemo, useState } from "react";
import { View } from "@tarojs/components";
import Taro, { usePullDownRefresh } from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { workToPlayerTrack } from "@vibe-sorcery/types";
import { PageShell } from "../../../components/PageShell";
import { WorkRow } from "../../../components/community/WorkRow";
import { WorkCoverCard } from "../../../components/community/WorkCoverCard";
import { AuthBanner, Button, EmptyState, LoadingSkeleton, StatPill, ViewModeToggle, showSuccess, showError } from "../../../components/ui";
import { vibeApi } from "../../../services/api";
import { bootstrapAuth, isLoggedIn, requireAuth } from "../../../utils/auth";
import "./index.scss";

type CollectionItem = Awaited<ReturnType<typeof vibeApi.listCollections>>[number];
type ViewMode = "grid" | "list";

export default function CollectionsPage() {
  const { copy } = useLocale();
  const c = copy.collectionsUi;
  const w = copy.worksUi;
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("grid");

  async function load() {
    bootstrapAuth();
    if (!isLoggedIn()) {
      setLoading(false);
      Taro.stopPullDownRefresh();
      return;
    }
    setLoading(true);
    try {
      setItems(await vibeApi.listCollections());
    } catch {
      showError(c.loadFail);
    } finally {
      setLoading(false);
      Taro.stopPullDownRefresh();
    }
  }

  usePullDownRefresh(load);

  useEffect(() => {
    void load();
  }, []);

  const queue = useMemo(() => items.map((item) => workToPlayerTrack(item.work, { source: "collection" })), [items]);

  async function remove(workId: string) {
    if (!requireAuth()) return;
    try {
      await vibeApi.removeCollection(workId);
      setItems((prev) => prev.filter((i) => i.work.id !== workId));
      showSuccess(copy.discoverUi.collectRemoved);
    } catch {
      showError(c.loadFail);
    }
  }

  if (!isLoggedIn()) {
    return (
      <PageShell label={copy.navGroups.works} title={c.title} subtitle={c.loginSubtitle} showCredits={false} ambient wide>
        <AuthBanner message={copy.settingsUi.authBanner} loginLabel={copy.loginUi.login} />
        <Button variant="primary" block className="auth-gate__cta" onClick={() => requireAuth()}>
          {copy.loginUi.login}
        </Button>
      </PageShell>
    );
  }

  return (
    <PageShell label={copy.navGroups.works} title={c.title} subtitle={c.subtitle} wide ambient>
      {items.length > 0 && (
        <View className="collections-toolbar">
          <StatPill label={c.countLabel.replace("{n}", String(items.length))} variant="muted" />
          <ViewModeToggle
            options={[
              { value: "grid", icon: "grid", label: w.viewGrid },
              { value: "list", icon: "list", label: w.viewList },
            ]}
            value={view}
            onChange={(v) => setView(v as ViewMode)}
          />
        </View>
      )}
      {loading && <LoadingSkeleton count={4} />}
      {!loading && items.length === 0 && (
        <EmptyState
          iconName="bookmarkFilled"
          title={c.emptyTitle}
          description={c.emptyDesc}
          actionLabel={c.actionLabel}
          onAction={() => Taro.switchTab({ url: "/pages/feed/index" })}
        />
      )}
      {view === "grid" ? (
        <View className="collections-grid">
          {items.map((item) => (
            <View key={item.id} className="collections-grid__cell">
              <WorkCoverCard
                id={item.work.id}
                title={item.work.title}
                moods={item.work.moods}
                coverUrl={item.work.cover_url}
                hlsReady={!!item.work.hls_url}
                track={workToPlayerTrack(item.work, { source: "collection" })}
                queue={queue}
              />
              <Button size="sm" variant="ghost" block className="collections-grid__remove" onClick={() => remove(item.work.id)}>
                {c.removeLabel}
              </Button>
            </View>
          ))}
        </View>
      ) : (
        <View className="collections-list">
          {items.map((item) => (
            <View key={item.id} className="collections-row">
              <WorkRow
                id={item.work.id}
                title={item.work.title}
                moods={item.work.moods}
                coverUrl={item.work.cover_url}
                hlsReady={!!item.work.hls_url}
                track={workToPlayerTrack(item.work, { source: "collection" })}
                queue={queue}
              />
              <Button size="sm" variant="ghost" className="collections-row__remove" onClick={() => remove(item.work.id)}>
                {c.removeLabel}
              </Button>
            </View>
          ))}
        </View>
      )}
    </PageShell>
  );
}
