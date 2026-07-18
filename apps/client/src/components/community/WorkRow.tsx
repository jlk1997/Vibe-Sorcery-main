import { useState } from "react";
import { View, Text, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import type { PlayerTrack } from "@vibe-sorcery/types";
import { PlayTrackButton } from "../player/PlayTrackButton";
import { BottomSheet, Icon, Badge } from "../ui";
import { CommunityPostButton } from "./CommunityPostButton";
import { clsx } from "../../utils/clsx";
import "./WorkRow.scss";

type Props = {
  id: string;
  title: string;
  moods?: string[];
  coverUrl?: string;
  track?: PlayerTrack;
  queue?: PlayerTrack[];
  c2paVerified?: boolean;
  hlsReady?: boolean;
  published?: boolean;
  postId?: string | null;
  postProcessStatus?: Record<string, unknown>;
  onPublish?: () => void;
  onUnpublish?: () => void;
  onRemix?: () => void;
  onCover?: () => void;
  onEmbed?: () => void;
  onRename?: () => void;
  onGenerateCover?: () => void;
  onUploadCover?: () => void;
  onPostProcess?: () => void;
  compact?: boolean;
  onOpen?: () => void;
};

export function WorkRow({
  title,
  moods,
  coverUrl,
  track,
  queue,
  hlsReady,
  published,
  postId,
  onPublish,
  onUnpublish,
  onRemix,
  onCover,
  onEmbed,
  onRename,
  onGenerateCover,
  onUploadCover,
  onPostProcess,
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
    onUploadCover && { id: "upload-cover", label: w.coverUpload, onClick: onUploadCover },
    onPostProcess && { id: "post", label: w.postProcess, onClick: onPostProcess },
    onEmbed && { id: "embed", label: "Embed", onClick: onEmbed },
    onUnpublish && { id: "unpub", label: w.unpublish, onClick: onUnpublish, danger: true },
  ].filter(Boolean) as Array<{ id: string; label: string; onClick: () => void; danger?: boolean }>;

  const showCommunity = (!!postId && published) || !!onPublish;
  const showFooter = showCommunity || menuItems.length > 0;

  return (
    <>
      <View className="work-row">
        <View className="work-row__top" onClick={onOpen}>
          {coverUrl ? (
            <Image className="work-row__cover" src={coverUrl} mode="aspectFill" />
          ) : (
            <View className="work-row__cover work-row__cover--fallback">
              <Icon name="music" size="md" accent />
            </View>
          )}
          <View className="work-row__main">
            <Text className="work-row__title">{title}</Text>
            {moods?.length ? <Text className="work-row__tags">{moods.slice(0, 3).join(" · ")}</Text> : null}
            <View className="work-row__badges">
              {published && <Badge tone="accent">{w.published}</Badge>}
              {hlsReady && <Badge tone="success">HLS</Badge>}
            </View>
          </View>
          {track && (
            <View className="work-row__play" onClick={(e) => e.stopPropagation()}>
              <PlayTrackButton track={track} queue={queue} />
            </View>
          )}
        </View>

        {showFooter && (
          <View className="work-row__footer" onClick={(e) => e.stopPropagation()}>
            <CommunityPostButton
              postId={postId}
              published={published}
              onPublish={onPublish}
              block
              size="sm"
            />
            {menuItems.length > 0 && (
              <View className="work-row__more" onClick={() => setMenuOpen(true)}>
                <Icon name="more" size="sm" />
              </View>
            )}
          </View>
        )}
      </View>

      <BottomSheet open={menuOpen} title={title} onClose={() => setMenuOpen(false)}>
        {menuItems.map((item) => (
          <View
            key={item.id}
            className={clsx("work-row__menu-item", item.danger && "work-row__menu-item--danger")}
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
