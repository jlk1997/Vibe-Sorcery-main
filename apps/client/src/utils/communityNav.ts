import Taro from "@tarojs/taro";
import { setItem, removeItem, getItem } from "../platform/storage";
import { vibeApi } from "../services/api";
import { bootstrapAuth, isLoggedIn } from "./auth";

export const FEED_HIGHLIGHT_POST_KEY = "feed:highlightPostId";

export function openCommunityPost(postId: string) {
  setItem(FEED_HIGHLIGHT_POST_KEY, postId);
  Taro.switchTab({ url: "/pages/feed/index" });
}

export function consumeFeedHighlightPostId(): string | null {
  const id = getItem(FEED_HIGHLIGHT_POST_KEY);
  if (id) removeItem(FEED_HIGHLIGHT_POST_KEY);
  return id;
}

export async function resolvePostIdForWork(workId: string): Promise<string | null> {
  if (!isLoggedIn()) return null;
  bootstrapAuth();
  try {
    const me = await vibeApi.me();
    const feed = await vibeApi.getFeed("latest");
    const post = feed.find((p) => p.work?.id === workId && p.author_username === me.username);
    return post?.id ?? null;
  } catch {
    return null;
  }
}
