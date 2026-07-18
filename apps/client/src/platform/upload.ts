import Taro from "@tarojs/taro";
import { getAuthToken, API_BASE } from "@vibe-sorcery/api-client";

export type EmotionAnalysis = {
  moods: string[];
  genres: string[];
  arousal?: number;
  valence?: number;
};

export async function uploadFile(
  endpoint: string,
  filePath: string,
  fieldName = "file",
  extra?: Record<string, string>,
  idempotencyKey?: string,
): Promise<unknown> {
  const token = getAuthToken();
  const url = endpoint.startsWith("http") ? endpoint : `${API_BASE}${endpoint}`;
  const header: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  if (idempotencyKey) header["Idempotency-Key"] = idempotencyKey;
  const res = await Taro.uploadFile({
    url,
    filePath,
    name: fieldName,
    header,
    formData: extra,
  });
  if (res.statusCode >= 400) {
    throw new Error(res.data || "upload failed");
  }
  try {
    return JSON.parse(res.data);
  } catch {
    return res.data;
  }
}

export async function uploadBlobH5(
  endpoint: string,
  file: File,
  fieldName = "file",
  extra?: Record<string, string>,
  idempotencyKey?: string,
): Promise<unknown> {
  const token = getAuthToken();
  const url = endpoint.startsWith("http") ? endpoint : `${API_BASE}${endpoint}`;
  const form = new FormData();
  form.append(fieldName, file);
  if (extra) {
    Object.entries(extra).forEach(([k, v]) => form.append(k, v));
  }
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Pick an audio file — returns File on H5, temp path on weapp. */
export async function pickAudioFile(): Promise<File | string> {
  if (process.env.TARO_ENV === "h5" && typeof document !== "undefined") {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "audio/*,.mp3,.wav,.m4a";
      input.onchange = () => {
        const f = input.files?.[0];
        if (f) resolve(f);
        else reject(new Error("未选择文件"));
      };
      input.click();
    });
  }
  try {
    const msg = await Taro.chooseMessageFile({ count: 1, type: "file", extension: ["mp3", "wav", "m4a", "aac"] });
    const file = msg.tempFiles[0];
    if (file?.path) return file.path;
  } catch {
    /* fallback */
  }
  try {
    const media = await Taro.chooseMedia({ count: 1, mediaType: ["video"], sourceType: ["album"] });
    const path = media.tempFiles[0]?.tempFilePath;
    if (path) return path;
  } catch {
    /* ignore */
  }
  throw new Error("未选择文件");
}

export async function analyzeEmotionUniversal(file: File | string): Promise<EmotionAnalysis> {
  if (typeof file === "string") {
    return (await uploadFile("/emotion/analyze", file)) as EmotionAnalysis;
  }
  if (process.env.TARO_ENV === "h5") {
    return (await uploadBlobH5("/emotion/analyze", file)) as EmotionAnalysis;
  }
  throw new Error("H5 File upload required on this platform");
}

export async function uploadPlaylistForm(
  filePath: string,
  fields: Record<string, string>,
  idempotencyKey?: string,
) {
  return uploadFile("/works/generate/playlist", filePath, "file", fields, idempotencyKey);
}
