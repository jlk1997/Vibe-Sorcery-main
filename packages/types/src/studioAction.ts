/** Copilot → Studio handoff protocol (StudioAction). */

export type CreateMode =
  | "quickTrack"
  | "playlist"
  | "lyrics"
  | "remix"
  | "cover"
  | "variation";

export type CreditEstimate = {
  cost: number;
  label?: string;
};

export type CreatePrefill = {
  text_intent?: string;
  preset_id?: string;
  steps?: number;
  lyrics?: string;
  seed_work_id?: string;
  reference_work_id?: string;
  creative_spec?: Record<string, unknown>;
};

export type JourneyPrefill = {
  text_intent?: string;
  title?: string;
  journey: Record<string, unknown>;
};

export type StudioAction =
  | { type: "navigate"; path: string; params?: Record<string, string> }
  | { type: "prefill_create"; mode: CreateMode; payload: CreatePrefill }
  | { type: "prefill_journey"; payload: JourneyPrefill }
  | {
      type: "start_generation";
      mode: CreateMode;
      estimate: CreditEstimate;
      requires_confirm: true;
    }
  | { type: "show_paywall"; required: number; balance?: number | null };

export type CopilotChatResponse = {
  session_id: string;
  reply: string;
  tool_result?: Record<string, unknown>;
  tool_name?: string;
  actions?: StudioAction[];
  messages?: Array<{ role: string; content: string; tool_result?: Record<string, unknown> }>;
};
