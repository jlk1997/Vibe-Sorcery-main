import type { MusicCreativeSpec, SoundRecipeOptions } from "./music-creative-spec";

export type Waypoint = {
  step: number;
  arousal: number;
  valence: number;
  description?: string;
};

export type MusicParams = {
  bpm_range: [number, number];
  key: string;
  duration_preference: "short" | "medium" | "long";
};

export type JourneyPayload = {
  steps: number;
  target_curve: string;
  instrumental: boolean;
  title?: string;
  waypoints: Waypoint[];
};

export type PlatformStudioConfig = {
  curves: string[];
  keys: string[];
  bpm_presets: Array<{ label: string; range: [number, number] }>;
  duration_options: Array<{ value: string; label: string }>;
  sound_recipe?: SoundRecipeOptions;
  max_lyrics_length: number;
  default_bpm_range: [number, number];
  default_key: string;
  default_duration: string;
  lyrics_optimizer_default: boolean;
  cover_mode_default: string;
};

export type { MusicCreativeSpec, SoundRecipeOptions };

export const DEFAULT_MUSIC_PARAMS: MusicParams = {
  bpm_range: [80, 120],
  key: "auto",
  duration_preference: "medium",
};

export const CURVE_LABELS: Record<string, string> = {
  calm_to_energy: "平静 → 能量",
  sad_to_hope: "低落 → 希望",
  chaos_to_order: "纷乱 → 安定",
  neutral: "保持平稳",
};
