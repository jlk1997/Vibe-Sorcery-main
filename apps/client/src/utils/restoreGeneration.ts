import { vibeApi } from "../services/api";
import {
  clearActiveGeneration,
  loadActiveGeneration,
  saveActiveGeneration,
  type RemixSourceSnapshot,
  type StoredActiveGeneration,
} from "./generationStorage";
import { isTerminalJobStatus } from "./generationPhases";

export type { RemixSourceSnapshot } from "./generationStorage";

export function persistActiveGeneration(snapshot: StoredActiveGeneration) {
  saveActiveGeneration(snapshot);
}

function remixSourceFromJob(job: {
  job_type?: string | null;
  remix_source?: { work_id: string; remix_intent?: string | null; output_title?: string | null } | null;
}): RemixSourceSnapshot | undefined {
  const src = job.remix_source;
  if (job.job_type !== "remix" || !src?.work_id) return undefined;
  return {
    workId: src.work_id,
    title: "",
    intent: src.remix_intent || undefined,
  };
}

export async function resolveRestorableJobId(): Promise<{
  jobId: string;
  returnUrl: string;
  startedAt: string;
  jobType: StoredActiveGeneration["jobType"];
  remixSource?: RemixSourceSnapshot;
} | null> {
  const stored = loadActiveGeneration();
  if (stored?.jobId) {
    try {
      const job = await vibeApi.getJob(stored.jobId);
      if (isTerminalJobStatus(job.status)) {
        clearActiveGeneration();
        return null;
      }
      const remixSource = stored.remixSource || remixSourceFromJob(job);
      return {
        jobId: stored.jobId,
        returnUrl: stored.returnUrl,
        startedAt: stored.startedAt,
        jobType:
          job.job_type === "remix"
            ? "remix"
            : job.job_type === "variations"
              ? "variations"
              : stored.jobType,
        remixSource,
      };
    } catch {
      clearActiveGeneration();
      return null;
    }
  }

  try {
    const active = await vibeApi.getActiveJob();
    if (!active?.id || isTerminalJobStatus(active.status)) return null;
    const remixSource = remixSourceFromJob(active);
    const jobType: StoredActiveGeneration["jobType"] =
      active.job_type === "remix"
        ? "remix"
        : active.job_type === "variations"
          ? "variations"
          : active.total_steps > 1
            ? "playlist"
            : "single";
    const snapshot: StoredActiveGeneration = {
      jobId: active.id,
      returnUrl: "/pages/create/index",
      startedAt: new Date().toISOString(),
      jobType,
      remixSource,
    };
    saveActiveGeneration(snapshot);
    return {
      jobId: snapshot.jobId,
      returnUrl: snapshot.returnUrl,
      startedAt: snapshot.startedAt,
      jobType: snapshot.jobType,
      remixSource: snapshot.remixSource,
    };
  } catch {
    return null;
  }
}

export function scheduleClearActiveGeneration(delayMs = 30_000) {
  setTimeout(() => clearActiveGeneration(), delayMs);
}
