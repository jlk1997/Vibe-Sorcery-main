import { useEffect, useMemo, useState } from "react";
import { View, ScrollView } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { STACK_PAGE_ROUTES } from "../../../constants/routes";
import { useLocale } from "@vibe-sorcery/i18n";
import { workToPlayerTrack } from "@vibe-sorcery/types";
import { PageShell, SectionLabel } from "../../../components/PageShell";
import { WorkCoverCard } from "../../../components/community/WorkCoverCard";
import { CreatorChip } from "../../../components/community/CreatorChip";
import { PostSnippetCard } from "../../../components/community/PostSnippetCard";
import { DerivativeSheet } from "../../../components/studio/DerivativeSheet";
import { EmptyState, LoadingSkeleton, SearchField, StatPill } from "../../../components/ui";
import { vibeApi } from "../../../services/api";
import { requireAuth } from "../../../utils/auth";
import "./index.scss";

export default function SearchPage() {
  const { copy } = useLocale();
  const s = copy.searchUi;
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Awaited<ReturnType<typeof vibeApi.globalSearch>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [derivative, setDerivative] = useState<{ workId: string; title: string } | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    const t = setTimeout(() => {
      setLoading(true);
      vibeApi
        .globalSearch(q.trim())
        .then(setResults)
        .catch(() => Taro.showToast({ title: s.loadFail, icon: "none" }))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q, s.loadFail]);

  const playQueue = useMemo(
    () => (results?.works ?? []).map((w) => workToPlayerTrack(w, { source: "search" })),
    [results?.works]
  );

  const workCoverById = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    results?.works.forEach((w) => {
      map[w.id] = w.cover_url;
    });
    return map;
  }, [results?.works]);

  const trimmed = q.trim();
  const hasQuery = trimmed.length >= 2;
  const totalResults = results ? results.users.length + results.works.length + results.posts.length : 0;
  const noResults = hasQuery && !loading && results && totalResults === 0;

  return (
    <PageShell label={copy.nav.search} title={s.title} subtitle={s.subtitle} wide immersive ambient noPadTop>
      <SearchField placeholder={s.placeholder} value={q} onInput={(e) => setQ(e.detail.value)} />
      {!hasQuery && !loading && (
        <EmptyState iconName="search" title={s.hintTitle} description={s.hint} className="search-empty-hint" />
      )}
      {hasQuery && !loading && results && totalResults > 0 && (
        <View className="search-stats">
          <StatPill label={s.resultCount.replace("{n}", String(totalResults))} />
        </View>
      )}
      {loading && <LoadingSkeleton count={3} variant="line" />}
      {noResults && <EmptyState iconName="search" title={s.empty} description={s.emptyHint} />}
      {results && results.users.length > 0 && (
        <View className="search-section">
          <SectionLabel>{s.creators}</SectionLabel>
          <ScrollView scrollX className="search-creators-scroll" enableFlex>
            <View className="search-creators-row">
              {results.users.map((u) => (
                <CreatorChip
                  key={u.username}
                  username={u.username}
                  displayName={u.display_name}
                  onClick={() => Taro.navigateTo({ url: `${STACK_PAGE_ROUTES.user}?username=${u.username}` })}
                />
              ))}
            </View>
          </ScrollView>
        </View>
      )}
      {results && results.works.length > 0 && (
        <View className="search-section">
          <SectionLabel>{s.works}</SectionLabel>
          <View className="search-works-grid">
            {results.works.map((w) => (
              <View key={w.id} className="search-works-grid__cell">
                <WorkCoverCard
                  id={w.id}
                  title={w.title}
                  moods={w.moods}
                  coverUrl={w.cover_url}
                  hlsReady={!!w.hls_url}
                  track={workToPlayerTrack(w, { source: "search" })}
                  queue={playQueue}
                  onRemix={() => {
                    if (!requireAuth()) return;
                    setDerivative({ workId: w.id, title: w.title });
                  }}
                />
              </View>
            ))}
          </View>
        </View>
      )}
      {results && results.posts.length > 0 && (
        <View className="search-section">
          <SectionLabel>{s.posts}</SectionLabel>
          {results.posts.map((post) => (
            <PostSnippetCard
              key={post.id}
              caption={post.caption}
              coverUrl={workCoverById[post.work_id]}
              fallbackTitle={copy.discoverUi.emptyTitle}
              onClick={() => Taro.navigateTo({ url: `/pages/provenance/index?workId=${post.work_id}` })}
            />
          ))}
        </View>
      )}
      {derivative && (
        <DerivativeSheet workId={derivative.workId} workTitle={derivative.title} onClose={() => setDerivative(null)} />
      )}
    </PageShell>
  );
}
