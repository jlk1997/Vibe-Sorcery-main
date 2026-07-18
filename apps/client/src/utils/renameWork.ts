import Taro from "@tarojs/taro";
import { isWorkVersionConflict } from "@vibe-sorcery/api-client";
import type { Copy } from "@vibe-sorcery/i18n";
import { vibeApi } from "../services/api";
import { invalidatePageCache } from "./pageCache";

export type RenameWorkInput = {
  workId: string;
  title: string;
  expectedVersion?: number;
  syncCommunityCaption?: boolean | null;
};

export type RenameWorkResult = {
  title: string;
  version: number;
  postCaptionSynced: boolean;
};

export async function renameWork(
  input: RenameWorkInput,
  copy: Copy,
): Promise<RenameWorkResult | null> {
  const trimmed = input.title.trim();
  if (!trimmed) {
    Taro.showToast({ title: copy.worksUi.renameEmpty, icon: "none" });
    return null;
  }

  try {
    const updated = await vibeApi.updateWork(input.workId, {
      title: trimmed,
      expectedVersion: input.expectedVersion,
      syncCommunityCaption: input.syncCommunityCaption,
    });
    invalidatePageCache("feed:");
    const synced = !!updated.post_caption_synced;
    Taro.showToast({
      title: synced ? copy.worksUi.renameSuccessSynced : copy.worksUi.renameSuccess,
      icon: "success",
    });
    return {
      title: updated.title,
      version: updated.version,
      postCaptionSynced: synced,
    };
  } catch (err) {
    if (isWorkVersionConflict(err)) {
      Taro.showToast({ title: copy.generation.workVersionConflict, icon: "none" });
      return null;
    }
    Taro.showToast({ title: copy.worksUi.renameFail, icon: "none" });
    return null;
  }
}

/** Whether community caption likely mirrors the work title (auto-sync default). */
export function captionMatchesWorkTitle(caption: string | null | undefined, workTitle: string): boolean {
  const c = (caption || "").trim();
  if (!c) return true;
  return c === workTitle.trim();
}
