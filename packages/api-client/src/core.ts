/** Safe env read — WeChat miniprogram has no Node `process`. */
function envVar(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  try {
    return process.env?.[name];
  } catch {
    return undefined;
  }
}

declare const TARO_APP_API_URL: string | undefined;

export const API_BASE = ((): string => {
  try {
    if (typeof TARO_APP_API_URL === "string" && TARO_APP_API_URL) return TARO_APP_API_URL;
  } catch {
    /* not a Taro build */
  }
  return (
    envVar("TARO_APP_API_URL") ||
    envVar("EXPO_PUBLIC_API_URL") ||
    envVar("NEXT_PUBLIC_API_URL") ||
    "http://localhost:8000/api/v1"
  );
})();

let token: string | null = null;

export function setAuthToken(t: string | null) {
  token = t;
}

export function getAuthToken() {
  return token;
}

export function getToken(): string | null {
  return token;
}

export function setToken(t: string) {
  token = t;
}

export function clearToken() {
  token = null;
}

export type HttpResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  blob?: () => Promise<Blob>;
};

export type HttpAdapter = (
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string | FormData }
) => Promise<HttpResponse>;

let httpAdapter: HttpAdapter | null = null;

export class ApiError extends Error {
  status: number;
  retryAfterSeconds?: number;
  errorCode?: string;

  constructor(
    message: string,
    status: number,
    meta?: { retryAfterSeconds?: number; errorCode?: string }
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryAfterSeconds = meta?.retryAfterSeconds;
    this.errorCode = meta?.errorCode;
  }

  get isUnauthorized() {
    return this.status === 401;
  }
}

export function isInsufficientCredits(err: unknown): boolean {
  return err instanceof ApiError && err.status === 402;
}

export function isRemixForbidden(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 403) return false;
  return err.message === "REMIX_FORBIDDEN" || err.message.includes("二次创作") || err.message.toLowerCase().includes("remix");
}

export function isUnauthorized(err: unknown): boolean {
  return err instanceof ApiError && err.isUnauthorized;
}

export function isRateLimited(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 429 || err.errorCode === "RATE_LIMITED");
}

export function getRateLimitRetryAfter(err: unknown): number | null {
  if (!(err instanceof ApiError) || !isRateLimited(err)) return null;
  return err.retryAfterSeconds ?? null;
}

export function isActiveJobLimit(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 409) return false;
  return err.message === "ACTIVE_JOB_LIMIT" || err.message.includes("生成任务");
}

export function isQueueOverload(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 409) return false;
  return err.message === "QUEUE_OVERLOAD" || err.message.includes("队列繁忙");
}

export function isWorkVersionConflict(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 409) return false;
  return err.message === "WORK_VERSION_CONFLICT" || err.message.includes("其他地方更新");
}

export function isDraftVersionConflict(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 409) return false;
  return err.message === "DRAFT_VERSION_CONFLICT" || err.message.includes("其他窗口");
}

export function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export type ApiRequestInit = RequestInit & { idempotencyKey?: string };
export type UploadRequestOptions = { idempotencyKey?: string };

export function setHttpAdapter(adapter: HttpAdapter | null) {
  httpAdapter = adapter;
}

export async function httpFetch(url: string, options: RequestInit = {}): Promise<HttpResponse> {
  if (httpAdapter) {
    return httpAdapter(url, {
      method: options.method,
      headers: options.headers as Record<string, string>,
      body: options.body as string | FormData | undefined,
    });
  }
  const res = await fetch(url, options);
  return {
    ok: res.ok,
    status: res.status,
    json: () => res.json(),
    blob: () => res.blob(),
  };
}

export type ErrorPayload = {
  message: string;
  retryAfterSeconds?: number;
  errorCode?: string;
};

export function parseErrorPayload(body: unknown, status: number): ErrorPayload {
  if (typeof body === "object" && body !== null && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") {
      if (detail === "Invalid credentials") return { message: "邮箱或密码不正确，如未注册请先创建账户" };
      if (detail === "Email already registered") return { message: "该邮箱已注册，请直接登录" };
      if (detail === "Username already taken") return { message: "用户名已被占用" };
      if (detail === "Work already published") return { message: "该作品已发布到 Discover" };
      if (detail === "Invalid work_id") return { message: "作品 ID 无效，请刷新页面后重试" };
      if (detail === "原作者未开放二次创作") return { message: "REMIX_FORBIDDEN", errorCode: "REMIX_FORBIDDEN" };
      if (status === 401) return { message: "请先登录后再继续" };
      return { message: detail };
    }
    if (typeof detail === "object" && detail !== null && !Array.isArray(detail)) {
      const code = (detail as { code?: string }).code;
      const retryAfter = (detail as { retry_after_seconds?: number }).retry_after_seconds;
      const message = (detail as { message?: string }).message;
      if (code === "ACTIVE_JOB_LIMIT") return { message: "ACTIVE_JOB_LIMIT", errorCode: code };
      if (code === "QUEUE_OVERLOAD") return { message: "QUEUE_OVERLOAD", errorCode: code };
      if (code === "RATE_LIMITED") {
        return {
          message: "RATE_LIMITED",
          errorCode: code,
          retryAfterSeconds: typeof retryAfter === "number" ? retryAfter : undefined,
        };
      }
      if (code === "WORK_VERSION_CONFLICT") return { message: "WORK_VERSION_CONFLICT", errorCode: code };
      if (code === "DRAFT_VERSION_CONFLICT") return { message: "DRAFT_VERSION_CONFLICT", errorCode: code };
      if (typeof message === "string" && message) return { message, errorCode: code };
    }
    if (Array.isArray(detail)) {
      return {
        message: detail
          .map((item) => (typeof item === "object" && item && "msg" in item ? String(item.msg) : String(item)))
          .join("; "),
      };
    }
  }
  if (status === 401) return { message: "请先登录后再继续" };
  if (status === 402) return { message: "创作额度不足，请前往定价页充值" };
  if (status === 403) return { message: "没有权限执行此操作" };
  if (status === 409) return { message: "请求冲突，请刷新后重试" };
  if (status >= 500) return { message: "服务器错误，请稍后重试" };
  return { message: "请求失败，请稍后重试" };
}

export function parseErrorDetail(body: unknown, status: number): string {
  return parseErrorPayload(body, status).message;
}

export async function parseResponse<T>(res: HttpResponse): Promise<T> {
  if (res.ok) {
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }
  const body = await res.json().catch(() => ({}));
  const payload = parseErrorPayload(body, res.status);
  throw new ApiError(payload.message, res.status, {
    retryAfterSeconds: payload.retryAfterSeconds,
    errorCode: payload.errorCode,
  });
}

const _inflightGets = new Map<string, Promise<unknown>>();
const _jobGetLastAt = new Map<string, number>();
const JOB_STATUS_GET_MIN_MS = 2000;

function isJobStatusGet(path: string) {
  return /^\/jobs\/[^/]+$/.test(path);
}

export async function request<T>(path: string, options: ApiRequestInit = {}): Promise<T> {
  const { idempotencyKey, ...rest } = options;
  const method = (rest.method || "GET").toUpperCase();
  if (method === "GET") {
    if (isJobStatusGet(path)) {
      const lastAt = _jobGetLastAt.get(path) ?? 0;
      const waitMs = JOB_STATUS_GET_MIN_MS - (Date.now() - lastAt);
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
    const existing = _inflightGets.get(path);
    if (existing) return existing as Promise<T>;
    const promise = (async () => {
      const headers: Record<string, string> = {
        ...(rest.headers as Record<string, string>),
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await httpFetch(`${API_BASE}${path}`, { ...rest, headers, method: "GET" });
      const data = await parseResponse<T>(res);
      if (isJobStatusGet(path)) {
        _jobGetLastAt.set(path, Date.now());
      }
      return data;
    })().finally(() => {
      _inflightGets.delete(path);
    });
    _inflightGets.set(path, promise);
    return promise;
  }

  const headers: Record<string, string> = {
    ...(rest.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  // WeChat mini-program has no global FormData — never touch the identifier unless it exists.
  const bodyIsFormData =
    typeof FormData !== "undefined" && rest.body != null && rest.body instanceof FormData;
  if (!bodyIsFormData) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }
  const res = await httpFetch(`${API_BASE}${path}`, { ...rest, headers });
  return parseResponse<T>(res);
}

export async function uploadRequest<T>(
  path: string,
  form: FormData,
  options: UploadRequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  const res = await httpFetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: form,
  });
  return parseResponse<T>(res);
}
