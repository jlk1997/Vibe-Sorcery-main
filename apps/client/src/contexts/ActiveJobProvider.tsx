import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type ActiveJobSnapshot = {
  jobId: string;
  progress: number;
  status: string;
  message: string;
  returnUrl: string;
  phase?: string | null;
  workId?: string;
  startedAt?: string;
  remixSourceTitle?: string;
  jobType?: "single" | "playlist" | "variations" | "remix";
};

type ActiveJobContextValue = {
  job: ActiveJobSnapshot | null;
  setJob: (snapshot: ActiveJobSnapshot | null) => void;
  patchJob: (patch: Partial<ActiveJobSnapshot>) => void;
};

const ActiveJobContext = createContext<ActiveJobContextValue | null>(null);

export function ActiveJobProvider({ children }: { children: ReactNode }) {
  const [job, setJobState] = useState<ActiveJobSnapshot | null>(null);

  const setJob = useCallback((snapshot: ActiveJobSnapshot | null) => {
    setJobState(snapshot);
  }, []);

  const patchJob = useCallback((patch: Partial<ActiveJobSnapshot>) => {
    setJobState((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      if (
        prev.jobId === next.jobId &&
        prev.progress === next.progress &&
        prev.status === next.status &&
        prev.message === next.message &&
        prev.returnUrl === next.returnUrl &&
        prev.phase === next.phase &&
        prev.workId === next.workId &&
        prev.startedAt === next.startedAt &&
        prev.remixSourceTitle === next.remixSourceTitle &&
        prev.jobType === next.jobType
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ job, setJob, patchJob }), [job, setJob, patchJob]);

  return <ActiveJobContext.Provider value={value}>{children}</ActiveJobContext.Provider>;
}

export function useActiveJobOptional() {
  return useContext(ActiveJobContext);
}
