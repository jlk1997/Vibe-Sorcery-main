import Taro from "@tarojs/taro";
import { stackPage } from "../constants/routes";

export type WorkFilter = "all" | "draft" | "published" | "derivative";

export function openWorkDetail(workId: string) {
  Taro.navigateTo({ url: stackPage("work", { workId }) });
}

function hasCommunityPost(
  postByWork: Record<string, string | { postId?: string } | undefined>,
  workId: string,
): boolean {
  const entry = postByWork[workId];
  if (!entry) return false;
  if (typeof entry === "string") return !!entry;
  return !!entry.postId;
}

export function isWorkPublished(
  work: { id: string; visibility?: string },
  postByWork: Record<string, string | { postId?: string } | undefined>,
): boolean {
  return work.visibility === "public" || hasCommunityPost(postByWork, work.id);
}

export function filterWorks<T extends { id: string; visibility?: string; parent_work_id?: string }>(
  works: T[],
  filter: WorkFilter,
  postByWork: Record<string, string | { postId?: string } | undefined>,
): T[] {
  if (filter === "all") return works;
  if (filter === "published") {
    return works.filter((w) => isWorkPublished(w, postByWork));
  }
  if (filter === "draft") {
    return works.filter((w) => !isWorkPublished(w, postByWork));
  }
  if (filter === "derivative") {
    return works.filter((w) => !!w.parent_work_id);
  }
  return works;
}

export function parseWorkFilter(raw?: string): WorkFilter {
  if (raw === "published" || raw === "draft" || raw === "derivative") return raw;
  return "all";
}
