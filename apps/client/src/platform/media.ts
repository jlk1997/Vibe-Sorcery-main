import Taro from "@tarojs/taro";
import { API_BASE, getAuthToken } from "@vibe-sorcery/api-client";
import type { PlayerTrack } from "@vibe-sorcery/types";

/** Resolve relative API media paths to absolute URLs. */
export function resolveMediaUrl(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  const base = API_BASE.replace(/\/$/, "");
  return url.startsWith("/") ? `${base}${url}` : `${base}/${url}`;
}

/** Append playback ticket and/or access_token for protected media gateway URLs. */
export function withMediaAuth(url: string): string {
  const resolved = resolveMediaUrl(url);
  if (!resolved) return resolved;
  const isProtected =
    resolved.includes("/works/") &&
    (resolved.includes("/stream") || resolved.includes("/hls/"));
  if (!isProtected) return resolved;
  if (resolved.includes("access_token=")) return resolved;
  const token = getAuthToken();
  if (!token) return resolved;
  // Always attach access_token alongside any embedded ticket. Tickets are minted
  // when the work list/detail is fetched and expire after ~10 min, so a ticket
  // embedded in cached data can be stale by the time the user hits play. The
  // access_token lets the gateway authorize the viewer directly as a fallback.
  const sep = resolved.includes("?") ? "&" : "?";
  return `${resolved}${sep}access_token=${encodeURIComponent(token)}`;
}

export function playbackUrls(track: PlayerTrack): { primary: string; fallback: string } {
  const audio = withMediaAuth(resolveMediaUrl(track.audioUrl));
  const hls = track.hlsUrl ? withMediaAuth(resolveMediaUrl(track.hlsUrl)) : null;
  // WeChat InnerAudioContext cannot play HLS/m3u8 — always use the MP3 stream on weapp.
  if (process.env.TARO_ENV === "weapp" || !hls) {
    return { primary: audio, fallback: audio };
  }
  // H5: prefer HLS (segmented + ticketed); MP3 gateway stream as fallback.
  return { primary: hls, fallback: audio };
}

export function authHeader(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Download remote video and save to device (WeChat album or H5 download). */
export async function saveVideoFromUrl(url: string, filename = "mood-mv.mp4"): Promise<void> {
  const resolved = resolveMediaUrl(url);
  if (process.env.TARO_ENV === "weapp") {
    const dl = await Taro.downloadFile({ url: resolved });
    if (dl.statusCode !== 200 || !dl.tempFilePath) throw new Error("download failed");
    await Taro.saveVideoToPhotosAlbum({ filePath: dl.tempFilePath });
    return;
  }
  if (typeof window !== "undefined") {
    const a = document.createElement("a");
    a.href = resolved;
    a.download = filename;
    a.rel = "noopener";
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  await Taro.setClipboardData({ data: resolved });
}
