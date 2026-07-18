import { useEffect, useRef } from "react";
import Taro from "@tarojs/taro";
import { isDraftVersionConflict } from "@vibe-sorcery/api-client";
import { vibeApi } from "../services/api";
import { isLoggedIn } from "../utils/auth";
import { getItem, setItem } from "../platform/storage";

const DEBOUNCE_MS = 3000;

function draftStorageKey(mode: string) {
  return `studio:draftId:${mode}`;
}

function draftVersionKey(mode: string) {
  return `studio:draftVersion:${mode}`;
}

function readStoredDraftVersion(mode: string): number | undefined {
  const raw = getItem(draftVersionKey(mode));
  return raw ? Number(raw) : undefined;
}

export type ServerDraftConflict = {
  id: string;
  version: number;
  title: string;
  payload: Record<string, unknown>;
};

/** Debounced server-side Studio draft sync — upserts one draft per mode with optimistic version. */
export function useServerDraftSync(
  enabled: boolean,
  mode: string,
  payload: Record<string, unknown>,
  title: string,
  onConflict?: (draft: ServerDraftConflict) => void,
  conflictToast?: string,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef("");
  const draftIdRef = useRef<string | undefined>(getItem(draftStorageKey(mode)) || undefined);
  const draftVersionRef = useRef<number | undefined>(readStoredDraftVersion(mode));

  useEffect(() => {
    draftIdRef.current = getItem(draftStorageKey(mode)) || draftIdRef.current;
    const rawVersion = getItem(draftVersionKey(mode));
    if (rawVersion) draftVersionRef.current = Number(rawVersion);
  }, [mode]);

  useEffect(() => {
    if (!enabled || !isLoggedIn()) return;
    const serialized = JSON.stringify({ mode, payload, title });
    if (serialized === lastSavedRef.current) return;
    if (!title.trim() && !String(payload.textIntent || "").trim()) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      vibeApi
        .saveDraft(title.slice(0, 40) || "Draft", mode, payload, draftIdRef.current, draftVersionRef.current)
        .then((res) => {
          draftIdRef.current = res.id;
          draftVersionRef.current = res.version;
          setItem(draftStorageKey(mode), res.id);
          setItem(draftVersionKey(mode), String(res.version));
          lastSavedRef.current = serialized;
        })
        .catch(async (err) => {
          if (!isDraftVersionConflict(err)) return;
          try {
            const drafts = await vibeApi.listDrafts();
            const match =
              drafts.find((d) => d.id === draftIdRef.current) ?? drafts.find((d) => d.mode === mode);
            if (!match) return;
            draftIdRef.current = match.id;
            draftVersionRef.current = match.version;
            setItem(draftStorageKey(mode), match.id);
            setItem(draftVersionKey(mode), String(match.version));
            lastSavedRef.current = JSON.stringify({
              mode,
              payload: match.payload,
              title: match.title,
            });
            onConflict?.({
              id: match.id,
              version: match.version,
              title: match.title,
              payload: match.payload,
            });
            if (conflictToast) {
              Taro.showToast({ title: conflictToast, icon: "none" });
            }
          } catch {
            /* ignore reload failure */
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, mode, payload, title, onConflict, conflictToast]);
}
