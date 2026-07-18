import { useState } from "react";
import { View, Text, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import type { PlayerTrack } from "@vibe-sorcery/types";
import { PlayTrackButton } from "../player/PlayTrackButton";
import { BottomSheet, Icon, Badge } from "../ui";
import { CommunityPostButton } from "./CommunityPostButton";
import { AiGeneratedBadge } from "../legal/AiGeneratedBadge";
import { clsx } from "../../utils/clsx";
import "./WorkCoverCard.scss";

type Props = {
  id: string;
  title: string;
  coverUrl?: string;
  moods?: string[];
  track?: PlayerTrack;
  queue?: PlayerTrack[];
  published?: boolean;
  postId?: string | null;
  hlsReady?: boolean;
  c2paVerified?: boolean;
  isAiGenerated?: boolean;
  postProcessStatus?: Record<string, unknown>;
  selected?: boolean;
  selectMode?: boolean;
  onSelect?: () => void;
  onPublish?: () => void;
  onUnpublish?: () => void;
  onRemix?: () => void;
  onCover?: () => void;
  onGenerateCover?: () => void;
  onPostProcess?: () => void;
  onEmbed?: () => void;
  onRename?: () => void;
  onOpen?: () => void;
};

export function WorkCoverCard({
  title,
  coverUrl,
  moods,
  track,
  queue,
  published,
  postId,
  hlsReady,
  isAiGenerated = true,
  selected,
  selectMode,
  onSelect,
  onPublish,
  onUnpublish,
  onRemix,
  onCover,
  onGenerateCover,
  onPostProcess,
  onEmbed,
  onRename,
  onOpen,
}: Props) {
  const { copy } = useLocale();
  const w = copy.worksUi;
  const [menuOpen, setMenuOpen] = useState(false);

  const menuItems = [
    onRename && { id: "rename", label: w.renameAction, onClick: onRename },
    onRemix && { id: "remix", label: copy.derivative.remix.short, onClick: onRemix },
    onCover && { id: "cover", label: copy.derivative.cover.short, onClick: onCover },
    track && {
      id: "prov",
      label: copy.workDetailUi.viewProvenance,
      onClick: () => Taro.navigateTo({ url: `/pages/provenance/index?workId=${track.id}` }),
    },
    onGenerateCover && { id: "gen-cover", label: w.generateCover, onClick: onGenerateCover },
    onPostProcess && { id: "post", label: w.postProcess, onClick: onPostProcess },
    onEmbed && { id: "embed", label: "Embed", onClick: onEmbed },
    onUnpublish && { id: "unpub", label: w.unpublish, onClick: onUnpublish, danger: true },
  ].filter(Boolean) as Array<{ id: string; label: string; onClick: () => void; danger?: boolean }>;

  return (
    <>
      <View
        className={clsx("work-cover-card", selected && "work-cover-card--selected", selectMode && "work-cover-card--select")}
        onClick={selectMode ? onSelect : onOpen}
      >
        <View className="work-cover-card__hero">
          {coverUrl ? (
            <Image className="work-cover-card__img" src={coverUrl} mode="aspectFill" />
          ) : (
            <View className="work-cover-card__img work-cover-card__img--fallback">
              <Icon name="music" size="lg" accent />
            </View>
          )}
          <View className="work-cover-card__gradient" />
          {selectMode && (
            <View className={clsx("work-cover-card__check", selected && "work-cover-card__check--on")}>
              {selected && <Text>✓</Text>}
            </View>
          )}
          {!selectMode && track && (
            <View className="work-cover-card__play" onClick={(e) => e.stopPropagation()}>
              <PlayTrackButton track={track} queue={queue} />
            </View>
          )}
          <View className="work-cover-card__badges">
            {isAiGenerated && <AiGeneratedBadge compact />}
            {published && <Badge tone="accent">{w.published}</Badge>}
            {hlsReady && <Badge tone="success">HLS</Badge>}
          </View>
        </View>

        <View className="work-cover-card__body">
          <Text className="work-cover-card__title">{title}</Text>
          {moods?.length ? <Text className="work-cover-card__moods">{moods.slice(0, 2).join(" · ")}</Text> : null}

          {!selectMode && (
            <View className="work-cover-card__footer" onClick={(e) => e.stopPropagation()}>
              <CommunityPostButton
                postId={postId}
                published={published}
                onPublish={onPublish}
                block
                size="sm"
              />
              {menuItems.length > 0 && (
                <View className="work-cover-card__more" onClick={() => setMenuOpen(true)}>
                  <Icon name="more" size="sm" />
                </View>
              )}
            </View>
          )}
        </View>
      </View>

      <BottomSheet open={menuOpen} title={title} onClose={() => setMenuOpen(false)}>
        {menuItems.map((item) => (
          <View
            key={item.id}
            className={clsx("work-cover-card__menu-item", item.danger && "work-cover-card__menu-item--danger")}
            onClick={() => {
              setMenuOpen(false);
              item.onClick();
            }}
          >
            <Text>{item.label}</Text>
          </View>
        ))}
      </BottomSheet>
    </>
  );
}
