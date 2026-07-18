import { API_BASE, getToken, request } from "./core";

export type JobPayload = {
  status: string;
  progress: number;
  current_step?: number;
  total_steps?: number;
  phase?: string | null;
  job_type?: string | null;
  remix_source?: { work_id: string; remix_intent?: string | null; output_title?: string | null } | null;
  result?: Record<string, unknown>;
  error_message?: string;
  error_code?: string | null;
  status_message?: string;
  error?: string;
  queue_ahead?: number | null;
  estimated_wait_seconds?: number | null;
  compose_eta_seconds?: number | null;
  priority_lane?: boolean | null;
  tracker_error?: "connection" | "not_found";
};

export type JobUpdateHandler = (data: JobPayload) => void;

const POLL_INITIAL_MS = 1000;
const POLL_MAX_MS = 4000;
const POLL_BACKOFF = 1.35;
const POLL_FAIL_THRESHOLD = 3;

const terminal = (status: string) => ["completed", "failed", "cancelled"].includes(status);

const isComposingPhase = (phase?: string | null) => phase === "composing" || (phase?.startsWith("track_") ?? false);

type SharedEntry = {
  refCount: number;
  subscribers: Set<JobUpdateHandler>;
  cleanup: () => void;
};

const sharedTrackers = new Map<string, SharedEntry>();

function payloadFingerprint(data: JobPayload): string {
  return `${data.status}|${data.progress}|${data.phase ?? ""}|${data.current_step ?? ""}|${data.status_message ?? ""}|${data.queue_ahead ?? ""}|${data.estimated_wait_seconds ?? ""}|${data.compose_eta_seconds ?? ""}|${JSON.stringify(data.result?.work_id ?? "")}`;
}

function createJobTracker(jobId: string, broadcast: (data: JobPayload) => void): () => void {
  let stopped = false;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  let ws: WebSocket | null = null;
  let pollDelay = POLL_INITIAL_MS;
  let pollGeneration = 0;
  let wsActive = false;
  let polling = false;
  let finished = false;
  let lastFingerprint = "";
  let pollFailStreak = 0;

  const emit = (data: JobPayload) => {
    if (stopped) return;
    if (data.tracker_error) {
      broadcast(data);
      return;
    }
    if (data.error === "Job not found") {
      broadcast({ status: "failed", progress: 0, tracker_error: "not_found" });
      finished = true;
      stopPoll();
      return;
    }
    if (data.error) return;
    pollFailStreak = 0;
    broadcast(data);
    if (terminal(data.status)) {
      finished = true;
      stopPoll();
    }
  };

  const stopPoll = () => {
    pollGeneration += 1;
    polling = false;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
  };

  let lastPollAt = 0;

  const startPoll = () => {
    if (stopped || finished || wsActive || polling) return;
    stopPoll();
    polling = true;
    pollDelay = POLL_INITIAL_MS;
    lastFingerprint = "";
    pollFailStreak = 0;
    const generation = pollGeneration;

    const tick = async () => {
      if (stopped || finished || wsActive || generation !== pollGeneration) return;
      const now = Date.now();
      const waitMs = Math.max(0, pollDelay - (now - lastPollAt));
      if (waitMs > 0) {
        pollTimer = setTimeout(tick, waitMs);
        return;
      }
      lastPollAt = Date.now();
      try {
        const data = await request<JobPayload>(`/jobs/${jobId}`);
        if (stopped || finished || wsActive || generation !== pollGeneration) return;
        pollFailStreak = 0;
        const fp = payloadFingerprint(data);
        if (fp === lastFingerprint) {
          pollDelay = Math.min(
            Math.round(pollDelay * POLL_BACKOFF),
            isComposingPhase(data.phase) ? 2000 : POLL_MAX_MS
          );
        } else {
          pollDelay = isComposingPhase(data.phase) ? POLL_INITIAL_MS : 1500;
          lastFingerprint = fp;
        }
        emit(data);
        if (terminal(data.status)) return;
      } catch {
        if (stopped || finished || wsActive || generation !== pollGeneration) return;
        pollFailStreak += 1;
        if (pollFailStreak >= POLL_FAIL_THRESHOLD) {
          broadcast({ status: "running", progress: 0, tracker_error: "connection" });
        }
        pollDelay = Math.min(Math.round(pollDelay * POLL_BACKOFF), POLL_MAX_MS);
        pollTimer = setTimeout(tick, pollDelay);
        return;
      }
      pollTimer = setTimeout(tick, pollDelay);
    };
    tick();
  };

  const fallbackToPoll = () => {
    if (stopped || finished || wsActive) return;
    if (fallbackTimer) return;
    fallbackTimer = setTimeout(() => {
      fallbackTimer = null;
      if (!stopped && !finished && !wsActive) startPoll();
    }, 400);
  };

  const canStreamOverWs = () =>
    getToken() && typeof WebSocket !== "undefined" && /^https?:\/\//i.test(API_BASE);

  const connectWs = async () => {
    if (stopped || finished || !canStreamOverWs()) {
      startPoll();
      return;
    }
    try {
      const { ticket } = await request<{ ticket: string }>(`/jobs/${jobId}/stream-ticket`, { method: "POST" });
      if (stopped || finished) return;
      const wsUrl = API_BASE.replace(/^http/, "ws") + `/jobs/${jobId}/stream?ticket=${encodeURIComponent(ticket)}`;
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        wsActive = true;
        stopPoll();
      };
      ws.onmessage = (ev) => {
        const data = JSON.parse(ev.data) as JobPayload;
        emit(data);
        if (terminal(data.status)) {
          ws?.close();
        }
      };
      ws.onerror = () => {
        wsActive = false;
        ws?.close();
        ws = null;
        broadcast({ status: "running", progress: 0, tracker_error: "connection" });
        fallbackToPoll();
      };
      ws.onclose = () => {
        wsActive = false;
        ws = null;
        if (!finished) fallbackToPoll();
      };
    } catch {
      fallbackToPoll();
    }
  };

  if (canStreamOverWs()) {
    void connectWs();
  } else {
    startPoll();
  }

  return () => {
    stopped = true;
    stopPoll();
    ws?.close();
    ws = null;
  };
}

/** Subscribe to job updates; multiple subscribers share one WS/poll loop per jobId. */
export function subscribeJobTracker(jobId: string, onUpdate: JobUpdateHandler): () => void {
  let entry = sharedTrackers.get(jobId);
  if (!entry) {
    const subscribers = new Set<JobUpdateHandler>();
    const cleanup = createJobTracker(jobId, (data) => {
      for (const sub of subscribers) sub(data);
    });
    entry = { refCount: 0, subscribers, cleanup };
    sharedTrackers.set(jobId, entry);
  }
  entry.subscribers.add(onUpdate);
  entry.refCount += 1;
  return () => {
    const current = sharedTrackers.get(jobId);
    if (!current) return;
    current.subscribers.delete(onUpdate);
    current.refCount -= 1;
    if (current.refCount <= 0) {
      current.cleanup();
      sharedTrackers.delete(jobId);
    }
  };
}
