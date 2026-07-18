import { getItem, removeItem, setItem } from "../platform/storage";

export const GENERATION_ACTIVE_KEY = "generation:active";

export type RemixSourceSnapshot = {
  workId: string;
  title: string;
  intent?: string;
};

export type StoredActiveGeneration = {
  jobId: string;
  returnUrl: string;
  startedAt: string;
  jobType: "single" | "playlist" | "variations" | "remix";
  remixSource?: RemixSourceSnapshot;
};

export function saveActiveGeneration(snapshot: StoredActiveGeneration) {
  setItem(GENERATION_ACTIVE_KEY, JSON.stringify(snapshot));
}

export function loadActiveGeneration(): StoredActiveGeneration | null {
  const raw = getItem(GENERATION_ACTIVE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredActiveGeneration;
  } catch {
    return null;
  }
}

export function clearActiveGeneration() {
  removeItem(GENERATION_ACTIVE_KEY);
}
