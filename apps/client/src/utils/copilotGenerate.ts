import type { CreateMode, StudioAction } from "@vibe-sorcery/types";
import { emptyCreativeSpec, type MusicCreativeSpec } from "@vibe-sorcery/types";
import { vibeApi, generateIdempotencyKey } from "../services/api";
import { applyStudioActions } from "./studioBridge";
import { buildPayloadSpec } from "./creativeSpec";
import { applyCreditsResponse, ensureSufficientCredits, type CreditsApiPayload } from "./creditsSync";

type CreditsCtx = Parameters<typeof ensureSufficientCredits>[0];

export type CopilotGenerateResult = {
  jobId: string;
  mode: CreateMode;
  creditsPayload?: CreditsApiPayload;
};

function extractPrefill(actions: StudioAction[]) {
  const start = actions.find((a) => a.type === "start_generation");
  const prefill = actions.find((a) => a.type === "prefill_create");
  const mode = (start?.mode || prefill?.mode || "quickTrack") as CreateMode;
  const payload = prefill?.type === "prefill_create" ? prefill.payload : {};
  const cost = start?.type === "start_generation" ? start.estimate?.cost ?? 1 : 1;
  return { mode, payload, cost };
}

/** Start generation in-place from Copilot StudioAction list (A3). */
export async function startCopilotGeneration(
  actions: StudioAction[],
  creditsCtx: CreditsCtx,
  onInsufficient: () => void | Promise<void>
): Promise<CopilotGenerateResult | null> {
  const { mode, payload, cost } = extractPrefill(actions);
  if (!(await ensureSufficientCredits(creditsCtx, cost, onInsufficient))) return null;

  const idempotencyKey = generateIdempotencyKey();
  const textIntent = payload.text_intent?.trim() || "AI 创作";
  const rawSpec = payload.creative_spec as MusicCreativeSpec | undefined;
  const creativeSpec = buildPayloadSpec(rawSpec ? { ...emptyCreativeSpec(), ...rawSpec } : emptyCreativeSpec(), textIntent, "");
  try {
    if (mode === "playlist") {
      let journey: Record<string, unknown> = {
        mode: "prompt_journey",
        steps: payload.steps ?? 6,
        target_curve: "calm_to_energy",
        instrumental: true,
        title: textIntent.slice(0, 40),
        waypoints: [],
      };
      let musicParams = { bpm_range: [80, 120], key: "auto", duration_preference: "medium" };
      if (payload.preset_id) {
        const applied = await vibeApi.applyPreset(payload.preset_id, payload.steps ?? 6, textIntent);
        if (applied.journey) journey = applied.journey as Record<string, unknown>;
        if (applied.music_params) musicParams = applied.music_params as typeof musicParams;
      }
      const job = await vibeApi.generatePlaylistBody(
        {
          text_intent: textIntent,
          preset_id: payload.preset_id,
          generation_mode: "prompt_journey",
          journey,
          music_params: musicParams,
          creative_spec: creativeSpec,
        },
        idempotencyKey,
      );
      applyCreditsResponse(creditsCtx, job);
      return { jobId: job.id, mode, creditsPayload: job };
    }

    const job = await vibeApi.generateSingle({
      text_intent: textIntent,
      instrumental: !payload.lyrics,
      lyrics: payload.lyrics,
      title: textIntent.slice(0, 40),
      creative_spec: creativeSpec,
      idempotencyKey,
    });
    applyCreditsResponse(creditsCtx, job);
    return { jobId: job.id, mode: "quickTrack", creditsPayload: job };
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    if (status === 402) {
      await onInsufficient();
      return null;
    }
    throw err;
  }
}

export function openCopilotStudioFallback(actions: StudioAction[]) {
  applyStudioActions(actions);
}
