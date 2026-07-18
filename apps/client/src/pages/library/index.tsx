import { useCallback, useMemo, useState } from "react";
import { Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { workToPlayerTrack } from "@vibe-sorcery/types";
import { PageShell } from "../../components/PageShell";
import { PlaylistTile } from "../../components/community/PlaylistTile";
import {
  AuthBanner,
  AsyncPanel,
  Button,
  EmptyState,
  LibraryShelf,
  SectionLabel,
  SegmentedControl,
  TrackRow,
} from "../../components/ui";
import { usePlayer } from "../../contexts/PlayerProvider";
import { STACK_PAGE_ROUTES, stackPage, STUDIO_PAGE_ROUTES } from "../../constants/routes";
import { vibeApi } from "../../services/api";
import { bootstrapAuth, isLoggedIn } from "../../utils/auth";
import { getItem, removeItem } from "../../platform/storage";
import { openWorkDetail } from "../../utils/workNav";
import { openStackPage } from "../../utils/navigation";
import { CoachMarks } from "../../components/onboarding/CoachMarks";
import "./index.scss";
import "../../styles/tab-page.scss";

type Tab = "works" | "playlists" | "collections";

export default function LibraryPage() {
  const { copy } = useLocale();
  const l = copy.libraryUi;
  const { playTrack } = usePlayer();
  const [tab, setTab] = useState<Tab>("works");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [works, setWorks] = useState<Array<{ id: string; title: string; cover_url?: string; moods: string[]; audio_url: string }>>([]);
  const [playlists, setPlaylists] = useState<Array<{ id: string; title: string; track_count: number }>>([]);
  const [publicPlaylists, setPublicPlaylists] = useState<Array<{ id: string; title: string; track_count: number; owner_username?: string }>>([]);
  const [subscribedPlaylists, setSubscribedPlaylists] = useState<Array<{ id: string; title: string; track_count: number; owner_username?: string }>>([]);
  const [collections, setCollections] = useState<Array<{ id: string; work: { id: string; title: string; cover_url?: string; moods: string[]; audio_url: string } }>>([]);
  const loggedIn = isLoggedIn();

  const load = useCallback(async () => {
    bootstrapAuth();
    if (!isLoggedIn()) {
      setWorks([]);
      setPlaylists([]);
      setPublicPlaylists([]);
      setSubscribedPlaylists([]);
      setCollections([]);
      setLoading(false);
      Taro.stopPullDownRefresh();
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      const [w, pl, col, pub, subs] = await Promise.all([
        vibeApi.listWorks(),
        vibeApi.listPlaylists(),
        vibeApi.listCollections().catch(() => []),
        vibeApi.listPublicPlaylists().catch(() => []),
        vibeApi.listPlaylistSubscriptions().catch(() => []),
      ]);
      setWorks(w);
      setPlaylists(pl);
      setCollections(col);
      setPublicPlaylists(pub);
      setSubscribedPlaylists(subs);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      Taro.stopPullDownRefresh();
    }
  }, [copy.discoverUi.loadError]);

  useDidShow(() => {
    const savedTab = getItem("library:tab") as Tab | null;
    if (savedTab === "works" || savedTab === "playlists" || savedTab === "collections") {
      setTab(savedTab);
      removeItem("library:tab");
    }
    void load();
  });
  usePullDownRefresh(load);

  const workTracks = useMemo(
    () => works.filter((w) => w.audio_url).map((w) => workToPlayerTrack(w, { source: "library" })),
    [works]
  );

  const shelfItems = useMemo(
    () => works.slice(0, 6).map((w) => ({ id: w.id, title: w.title, coverUrl: w.cover_url })),
    [works]
  );

  function playWork(workId: string) {
    const track = workTracks.find((t) => t.id === workId);
    if (!track) return;
    playTrack(track, { queue: workTracks, navigate: true });
  }

  if (!loggedIn) {
    return (
      <PageShell title={l.title} subtitle={l.subtitle} ambient tabVariant wide noPadTop>
        <View className="tab-page library-page">
        <EmptyState
          iconName="music"
          title={l.loginTitle}
          description={l.loginDesc}
          actionLabel={copy.profileUi.loginButton}
          onAction={() => Taro.navigateTo({ url: STACK_PAGE_ROUTES.login })}
        />
        </View>
      </PageShell>
    );
  }

  return (
    <PageShell title={l.title} subtitle={l.subtitle} showCredits={false} ambient tabVariant wide noPadTop>
      <View className="tab-page library-page">
      <SegmentedControl
        className="library-tabs"
        options={[
          { value: "works", label: l.tabWorks },
          { value: "playlists", label: l.tabPlaylists },
          { value: "collections", label: l.tabCollections },
        ]}
        value={tab}
        onChange={setTab}
      />

      <AsyncPanel
        loading={loading}
        error={loadError}
        skeletonCount={4}
        errorIcon="music"
        errorTitle={copy.discoverUi.loadError}
        errorActionLabel={copy.discoverUi.retry}
        onRetry={() => void load()}
      >
      {tab === "works" && (
        <View className="library-panel">
          <LibraryShelf label={l.recentLabel} items={shelfItems} onSelect={playWork} />
          {works.length === 0 ? (
            <EmptyState
              iconName="music"
              title={l.emptyWorks}
              description={l.emptyWorksDesc}
              actionLabel={l.goCreate}
              onAction={() => Taro.switchTab({ url: "/pages/create/index" })}
            />
          ) : (
            works.map((w, i) => (
              <TrackRow
                key={w.id}
                index={i + 1}
                title={w.title}
                subtitle={w.moods?.slice(0, 2).join(" · ")}
                coverUrl={w.cover_url}
                onClick={() => openWorkDetail(w.id)}
                onPlay={() => playWork(w.id)}
              />
            ))
          )}
          {works.length > 0 && (
            <Button variant="ghost" block className="library-manage" onClick={() => Taro.navigateTo({ url: STACK_PAGE_ROUTES.works })}>
              {copy.worksUi.manageAll}
            </Button>
          )}
        </View>
      )}

      {tab === "playlists" && (
        <View className="library-panel library-panel--grid">
          {playlists.length === 0 ? (
            <EmptyState iconName="journey" title={l.emptyPlaylists} actionLabel={l.goCreate} onAction={() => openStackPage(STUDIO_PAGE_ROUTES.journey)} />
          ) : (
            playlists.map((pl, i) => (
              <PlaylistTile
                key={pl.id}
                title={pl.title}
                trackCount={pl.track_count}
                trackLabel={l.trackCount.replace("{n}", String(pl.track_count))}
                index={i}
                onClick={() => Taro.navigateTo({ url: stackPage("playlist", { id: pl.id }) })}
              />
            ))
          )}
          {subscribedPlaylists.length > 0 && (
            <>
              <SectionLabel>{l.subscribedPlaylistsLabel}</SectionLabel>
              {subscribedPlaylists.map((pl, i) => (
                <PlaylistTile
                  key={`sub-${pl.id}`}
                  title={pl.title}
                  trackCount={pl.track_count}
                  trackLabel={
                    pl.owner_username
                      ? `@${pl.owner_username} · ${l.trackCount.replace("{n}", String(pl.track_count))}`
                      : l.trackCount.replace("{n}", String(pl.track_count))
                  }
                  index={i}
                  onClick={() => Taro.navigateTo({ url: stackPage("playlist", { id: pl.id }) })}
                />
              ))}
            </>
          )}
          {publicPlaylists.length > 0 && (
            <>
              <SectionLabel>{l.publicPlaylistsLabel}</SectionLabel>
              {publicPlaylists.map((pl, i) => (
                <PlaylistTile
                  key={pl.id}
                  title={pl.title}
                  trackCount={pl.track_count}
                  trackLabel={
                    pl.owner_username
                      ? `@${pl.owner_username} · ${l.trackCount.replace("{n}", String(pl.track_count))}`
                      : l.trackCount.replace("{n}", String(pl.track_count))
                  }
                  index={i + playlists.length}
                  onClick={() => Taro.navigateTo({ url: stackPage("playlist", { id: pl.id }) })}
                />
              ))}
            </>
          )}
        </View>
      )}

      {tab === "collections" && (
        <View className="library-panel">
          {collections.length === 0 ? (
            <EmptyState iconName="bookmark" title={l.emptyCollections} actionLabel={copy.nav.discover} onAction={() => Taro.switchTab({ url: "/pages/feed/index" })} />
          ) : (
            collections.map((c, i) => (
              <TrackRow
                key={c.id}
                index={i + 1}
                title={c.work.title}
                subtitle={c.work.moods?.slice(0, 2).join(" · ")}
                coverUrl={c.work.cover_url}
                onClick={() => Taro.navigateTo({ url: `${STUDIO_PAGE_ROUTES.provenance}?workId=${c.work.id}` })}
                onPlay={() => {
                  const track = workToPlayerTrack(c.work, { source: "library" });
                  playTrack(track, { navigate: true });
                }}
              />
            ))
          )}
        </View>
      )}
      </AsyncPanel>
      <CoachMarks page="library" />
      </View>
    </PageShell>
  );
}
