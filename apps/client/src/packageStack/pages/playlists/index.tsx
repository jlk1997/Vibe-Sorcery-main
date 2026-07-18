import { useEffect, useState } from "react";
import { View } from "@tarojs/components";
import Taro, { usePullDownRefresh } from "@tarojs/taro";
import { STACK_PAGE_ROUTES } from "../../../constants/routes";
import { useLocale } from "@vibe-sorcery/i18n";
import { PageShell } from "../../../components/PageShell";
import { PlaylistTile } from "../../../components/community/PlaylistTile";
import { AuthBanner, Button, EmptyState, ListRow, LoadingSkeleton, ViewModeToggle } from "../../../components/ui";
import { vibeApi } from "../../../services/api";
import { bootstrapAuth, isLoggedIn, requireAuth } from "../../../utils/auth";
import "./index.scss";

type ViewMode = "grid" | "list";

export default function PlaylistsPage() {
  const { copy } = useLocale();
  const p = copy.playlistsUi;
  const w = copy.worksUi;
  const [items, setItems] = useState<Array<{ id: string; title: string; track_count: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("grid");

  async function load() {
    bootstrapAuth();
    if (!isLoggedIn()) {
      setItems([]);
      setLoading(false);
      Taro.stopPullDownRefresh();
      return;
    }
    setLoading(true);
    try {
      setItems(await vibeApi.listPlaylists());
    } catch {
      Taro.showToast({ title: p.loadFail, icon: "none" });
    } finally {
      setLoading(false);
      Taro.stopPullDownRefresh();
    }
  }

  usePullDownRefresh(load);

  useEffect(() => {
    load();
  }, []);

  if (!isLoggedIn()) {
    return (
      <PageShell label={copy.navGroups.works} title={p.title} subtitle={p.loginSubtitle} showCredits={false} ambient wide>
        <AuthBanner message={copy.settingsUi.authBanner} loginLabel={copy.loginUi.login} />
        <Button variant="primary" block className="auth-gate__cta" onClick={() => requireAuth()}>
          {copy.loginUi.login}
        </Button>
      </PageShell>
    );
  }

  return (
    <PageShell label={copy.navGroups.works} title={p.title} subtitle={p.subtitle} wide ambient>
      {items.length > 0 && (
        <View className="playlists-toolbar">
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
      {loading && <LoadingSkeleton count={3} />}
      {!loading && items.length === 0 && (
        <EmptyState
          iconName="journey"
          title={p.emptyTitle}
          description={p.emptyDesc}
          actionLabel={p.actionLabel}
          onAction={() => Taro.switchTab({ url: "/pages/create/index" })}
        />
      )}
      {view === "grid" ? (
        <View className="playlists-grid">
          {items.map((item, i) => (
            <PlaylistTile
              key={item.id}
              title={item.title}
              trackCount={item.track_count}
              trackLabel={p.trackMeta.replace("{n}", String(item.track_count))}
              index={i}
              onClick={() => Taro.navigateTo({ url: `${STACK_PAGE_ROUTES.playlist}?id=${item.id}` })}
            />
          ))}
        </View>
      ) : (
        <View className="playlists-list">
          {items.map((item) => (
            <ListRow
              key={item.id}
              label={item.title}
              hint={p.trackMeta.replace("{n}", String(item.track_count))}
              onClick={() => Taro.navigateTo({ url: `${STACK_PAGE_ROUTES.playlist}?id=${item.id}` })}
            />
          ))}
        </View>
      )}
    </PageShell>
  );
}
