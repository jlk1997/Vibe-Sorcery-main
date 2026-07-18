export {
  api,
  vibeApi,
  setAuthToken,
  getAuthToken,
  ApiError,
  generateIdempotencyKey,
  isActiveJobLimit,
  isQueueOverload,
  isRateLimited,
  getRateLimitRetryAfter,
  isInsufficientCredits,
  isRemixForbidden,
  isUnauthorized,
  API_BASE,
} from "@vibe-sorcery/api-client";
export type { Work, FeedPost } from "@vibe-sorcery/api-client";
