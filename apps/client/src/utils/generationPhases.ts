export const SINGLE_PHASE_ORDER = [
  "queued",
  "intent",
  "composing",
  "saving",
  "audio_ready",
  "post_processing",
  "hls",
  "waveform",
  "cover",
  "provenance",
  "done",
] as const;

export type GenerationPhase = (typeof SINGLE_PHASE_ORDER)[number] | string;

export function phaseIndex(phase: string | null | undefined): number {
  if (!phase) return 0;
  if (phase.startsWith("track_")) {
    const n = parseInt(phase.replace("track_", ""), 10);
    return Number.isFinite(n) ? Math.max(2, n) : 2;
  }
  const idx = SINGLE_PHASE_ORDER.indexOf(phase as (typeof SINGLE_PHASE_ORDER)[number]);
  return idx >= 0 ? idx : 0;
}

/** Map backend phase to 7-step ritual timeline index (0–6). */
export function ritualStepIndex(phase: string | null | undefined): number {
  if (!phase) return 0;
  if (phase.startsWith("track_")) return 2;
  switch (phase) {
    case "queued":
      return 0;
    case "intent":
      return 1;
    case "composing":
      return 2;
    case "saving":
      return 3;
    case "audio_ready":
      return 4;
    case "post_processing":
    case "hls":
    case "waveform":
    case "cover":
    case "provenance":
      return 5;
    case "done":
      return 6;
    default:
      return 0;
  }
}

export function phaseLabelKey(phase: string | null | undefined): string {
  if (!phase) return "queued";
  if (phase.startsWith("track_")) return "track";
  if (phase === "post_processing") return "post_processing";
  if (SINGLE_PHASE_ORDER.includes(phase as (typeof SINGLE_PHASE_ORDER)[number])) return phase;
  return "queued";
}

export const COMPOSE_ETA_SECONDS = 120;

export function isTerminalJobStatus(status: string) {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export function isActiveJobStatus(status: string) {
  return status === "pending" || status === "running" || status === "audio_ready" || status === "post_processing";
}

/** Ignore transient poll/transport glitches that should not surface as job failure in UI. */
export function isSpuriousJobFailure(data: {
  status: string;
  progress?: number;
  error_message?: string;
  startedMsAgo?: number;
}) {
  if (data.status !== "failed") return false;
  const msg = (data.error_message || "").toLowerCase();
  if (
    msg.includes("poll failed") ||
    msg.includes("请求失败") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("unauthorized")
  ) {
    return true;
  }
  if ((data.progress || 0) === 0 && (data.startedMsAgo ?? 999_999) < 5000) {
    return true;
  }
  return false;
}

export function canPreview(phase: string | null | undefined, result?: Record<string, unknown> | null) {
  if (result?.work_id && result?.audio_url) return true;
  if (!phase) return false;
  return phaseIndex(phase) >= phaseIndex("audio_ready");
}
