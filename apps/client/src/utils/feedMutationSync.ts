import { invalidatePageCache } from "./pageCache";
import { applyCreditsResponse, type CreditsApiPayload } from "./creditsSync";

type CreditsSync = {
  refresh: () => Promise<void>;
  setBalance?: (balance: number) => void;
} | null | undefined;

/** Keep feed cache and header credit pill in sync after publish/unpublish. */
export async function syncAfterFeedMutation(creditsCtx?: CreditsSync, res?: CreditsApiPayload | null) {
  invalidatePageCache("feed:");
  applyCreditsResponse(creditsCtx, res);
}
