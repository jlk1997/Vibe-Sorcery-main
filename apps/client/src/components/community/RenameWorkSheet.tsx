import { useEffect, useMemo, useState } from "react";
import { View, Text } from "@tarojs/components";
import { useLocale } from "@vibe-sorcery/i18n";
import { BottomSheet, Button, Input } from "../ui";
import { captionMatchesWorkTitle, renameWork } from "../../utils/renameWork";
import "./RenameWorkSheet.scss";

export type RenameWorkTarget = {
  id: string;
  title: string;
  version?: number;
  postId?: string | null;
  postCaption?: string | null;
};

type Props = {
  target: RenameWorkTarget | null;
  onClose: () => void;
  onSaved: (result: { id: string; title: string; version: number; postCaptionSynced: boolean }) => void;
};

export function RenameWorkSheet({ target, onClose, onSaved }: Props) {
  const { copy } = useLocale();
  const w = copy.worksUi;
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncCommunity, setSyncCommunity] = useState(true);

  const published = !!target?.postId;
  const captionIsTitle = useMemo(
    () => (target ? captionMatchesWorkTitle(target.postCaption, target.title) : true),
    [target],
  );

  useEffect(() => {
    if (!target) return;
    setDraft(target.title);
    setSyncCommunity(captionMatchesWorkTitle(target.postCaption, target.title));
  }, [target]);

  async function save() {
    if (!target || saving) return;
    const trimmed = draft.trim();
    if (!trimmed || trimmed === target.title.trim()) {
      onClose();
      return;
    }
    setSaving(true);
    const result = await renameWork(
      {
        workId: target.id,
        title: trimmed,
        expectedVersion: target.version,
        syncCommunityCaption: published ? syncCommunity : undefined,
      },
      copy,
    );
    setSaving(false);
    if (!result) return;
    onSaved({
      id: target.id,
      title: result.title,
      version: result.version,
      postCaptionSynced: result.postCaptionSynced,
    });
    onClose();
  }

  return (
    <BottomSheet open={!!target} title={w.renameTitle} onClose={onClose}>
      <View className="rename-work-sheet">
        <Text className="rename-work-sheet__label">{w.renameLabel}</Text>
        <Input
          value={draft}
          maxlength={120}
          placeholder={w.renamePlaceholder}
          onInput={(e) => setDraft(e.detail.value)}
        />
        {published && !captionIsTitle && (
          <View className="rename-work-sheet__sync" onClick={() => setSyncCommunity((v) => !v)}>
            <View className={`rename-work-sheet__check${syncCommunity ? " rename-work-sheet__check--on" : ""}`}>
              {syncCommunity && <Text>✓</Text>}
            </View>
            <View className="rename-work-sheet__sync-text">
              <Text className="rename-work-sheet__sync-title">{w.syncCommunityCaption}</Text>
              <Text className="rename-work-sheet__sync-hint">{w.syncCommunityCaptionHint}</Text>
            </View>
          </View>
        )}
        {published && captionIsTitle && (
          <Text className="rename-work-sheet__auto-hint">{w.renameCommunityAuto}</Text>
        )}
        <Button variant="primary" block disabled={saving} onClick={save}>
          {w.renameSave}
        </Button>
      </View>
    </BottomSheet>
  );
}
