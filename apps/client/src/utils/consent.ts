import { vibeApi } from "../services/api";
import { isLoggedIn } from "./auth";

export async function fetchConsentStatus() {
  if (!isLoggedIn()) {
    return { missing: ["privacy"] as string[], required_versions: {} as Record<string, string> };
  }
  try {
    return await vibeApi.getConsentStatus();
  } catch {
    return { missing: [] as string[], required_versions: {} as Record<string, string> };
  }
}

export async function ensureAiNoticeConsent(): Promise<boolean> {
  if (!isLoggedIn()) return false;
  const status = await fetchConsentStatus();
  if (!status.missing.includes("ai_notice")) return true;
  const versions = status.required_versions || {};
  await vibeApi.recordConsents([{ consent_type: "ai_notice", version: versions.ai_notice || "2026-07-20" }]);
  return true;
}

export async function getRequiredVersions(): Promise<Record<string, string>> {
  try {
    const docs = await vibeApi.getLegalDocuments();
    return docs.required_versions || {};
  } catch {
    return { terms: "2026-07-20", privacy: "2026-07-20", payment: "2026-07-20" };
  }
}
