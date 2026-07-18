import Taro from "@tarojs/taro";
import { vibeApi } from "../services/api";
import { getItem, setItem } from "./storage";

let cachedTmplIds: string[] | null = null;

async function resolveSubscribeTemplateIds(): Promise<string[]> {
  if (cachedTmplIds?.length) return cachedTmplIds.filter(Boolean);
  try {
    const cfg = await vibeApi.getPlatformConfig();
    const wx = (cfg as { wechat_subscribe?: { job_complete?: string; low_credits?: string } }).wechat_subscribe;
    const ids = [wx?.job_complete, wx?.low_credits].filter((id): id is string => !!id && !id.startsWith("GENERATION"));
    if (ids.length) {
      cachedTmplIds = ids;
      return ids;
    }
  } catch {
    /* fallback below */
  }
  const stored = getItem("wechat:subscribeTmplIds");
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as string[];
      if (parsed.length) return parsed.filter(Boolean);
    } catch {
      /* ignore */
    }
  }
  return [];
}

/** Request WeChat subscribe message permission before generation (weapp only). */
export async function requestGenerationSubscribeMessages(): Promise<void> {
  if (process.env.TARO_ENV !== "weapp") return;
  const tmplIds = await resolveSubscribeTemplateIds();
  if (!tmplIds.length) return;
  try {
    await Taro.requestSubscribeMessage({ tmplIds });
  } catch {
    /* user declined or not supported */
  }
}

/** Request low-credits subscribe template when balance is low (weapp only). */
export async function requestLowCreditsSubscribeMessages(): Promise<void> {
  if (process.env.TARO_ENV !== "weapp") return;
  try {
    const cfg = await vibeApi.getPlatformConfig();
    const lowId = (cfg as { wechat_subscribe?: { low_credits?: string } }).wechat_subscribe?.low_credits;
    if (!lowId || lowId.startsWith("GENERATION")) return;
    await Taro.requestSubscribeMessage({ tmplIds: [lowId] });
  } catch {
    /* user declined */
  }
}

/** Persist template IDs from build-time env (optional). */
export function cacheSubscribeTemplateIds(ids: string[]) {
  const valid = ids.filter(Boolean);
  if (valid.length) {
    cachedTmplIds = valid;
    setItem("wechat:subscribeTmplIds", JSON.stringify(valid));
  }
}
