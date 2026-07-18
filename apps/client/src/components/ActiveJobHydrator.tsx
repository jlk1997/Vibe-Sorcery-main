import { useEffect, useRef } from "react";
import { vibeApi } from "../services/api";
import { useActiveJobOptional } from "../contexts/ActiveJobProvider";
import { clearActiveGeneration, loadActiveGeneration } from "../utils/generationStorage";
import { isTerminalJobStatus } from "../utils/generationPhases";
import { isLoggedIn } from "../utils/auth";

/** One-shot restore of active job into context on app boot + background progress tracking. */
export function ActiveJobHydrator() {
  const ctx = useActiveJobOptional();
  const setJob = ctx?.setJob;
  const patchJob = ctx?.patchJob;
  const startedRef = useRef(false);

  useEffect(() => {
    if (!setJob || !isLoggedIn() || startedRef.current) return;

    const live = ctx?.job;
    if (live?.jobId && !isTerminalJobStatus(live.status)) {
      startedRef.current = true;
      return;
    }

    startedRef.current = true;
    let cancelled = false;

    async function hydrate() {
      const stored = loadActiveGeneration();
      let jobId = stored?.jobId;
      let returnUrl = stored?.returnUrl || "/pages/create/index";
      let startedAt = stored?.startedAt;
      let jobType = stored?.jobType || "single";

      if (!jobId) {
        try {
          const active = await vibeApi.getActiveJob();
          if (!active?.id || isTerminalJobStatus(active.status)) return;
          jobId = active.id;
          returnUrl = "/pages/create/index";
          startedAt = new Date().toISOString();
        } catch {
          return;
        }
      }

      if (!jobId || cancelled) return;

      try {
        const job = await vibeApi.getJob(jobId);
        if (cancelled || isTerminalJobStatus(job.status)) {
          clearActiveGeneration();
          return;
        }
        setJob({
          jobId,
          progress: Math.round((job.progress || 0) * 100),
          status: job.status,
          message: job.status_message || "",
          returnUrl,
          phase: job.phase,
          workId: job.result?.work_id as string | undefined,
          startedAt,
          jobType,
        });
      } catch {
        /* ignore */
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on boot; ctx.job must not retrigger hydrate
  }, [setJob]);

  useEffect(() => {
    const jobId = ctx?.job?.jobId;
    if (!jobId || !patchJob || isTerminalJobStatus(ctx.job.status)) return;

    return vibeApi.trackJob(jobId, (data) => {
      patchJob({
        progress: Math.round((data.progress || 0) * 100),
        status: data.status,
        message: data.status_message || "",
        phase: data.phase ?? undefined,
        workId: (data.result?.work_id as string | undefined) ?? undefined,
      });
      if (isTerminalJobStatus(data.status)) {
        clearActiveGeneration();
      }
    });
  }, [ctx?.job?.jobId, ctx?.job?.status, patchJob]);

  return null;
}
