import type { MusicCreativeSpec, SoundRecipeOptions, TempoFeel } from "@vibe-sorcery/types";

export function hasCreativeConstraints(spec: MusicCreativeSpec): boolean {
  return !!(
    spec.instruments.length ||
    spec.genres.length ||
    spec.moods.length ||
    spec.tempo_feel ||
    spec.texture ||
    spec.meter ||
    spec.era ||
    spec.bpm != null ||
    spec.bpm_range ||
    spec.custom_prompt_override?.trim()
  );
}

export function buildPayloadSpec(
  spec: MusicCreativeSpec,
  textIntent: string,
  styleTags: string,
): MusicCreativeSpec {
  return {
    ...spec,
    text_intent: textIntent.trim(),
    style_tags: styleTags.trim(),
  };
}

const GENRE_ALIASES: Record<string, string> = {
  "lo-fi": "lofi",
  chillhop: "lofi",
  "hip-hop": "hiphop",
  orchestral: "cinematic",
};

const MOOD_ALIASES: Record<string, string> = {
  peaceful: "calm",
  focused: "calm",
  uplifting: "energetic",
  excited: "energetic",
  dramatic: "dark",
  epic: "energetic",
  emotional: "melancholic",
  bright: "happy",
  mysterious: "dark",
  ritual: "dark",
};

function mapOptionId(value: string, category: "genres" | "moods", options?: SoundRecipeOptions): string {
  const key = value.trim().toLowerCase();
  if (!key) return "";
  const alias = category === "genres" ? GENRE_ALIASES[key] : MOOD_ALIASES[key];
  if (alias) return alias;
  const list = category === "genres" ? options?.genres : options?.moods;
  const match = list?.find((o) => o.id === key || o.token?.toLowerCase() === key);
  return match?.id ?? value;
}

function tempoFromBpmRange(range?: number[] | null): TempoFeel {
  if (!range || range.length < 2) return "";
  const avg = (range[0] + range[1]) / 2;
  if (avg < 85) return "slow";
  if (avg > 105) return "fast";
  return "medium";
}

export type PresetApplied = {
  music_params?: { bpm_range?: number[]; key?: string };
  moods?: string[];
  genres?: string[];
};

export function mergePresetApplied(
  spec: MusicCreativeSpec,
  applied: PresetApplied,
  options?: SoundRecipeOptions,
): MusicCreativeSpec {
  const bpmRange = applied.music_params?.bpm_range;
  return {
    ...spec,
    genres: applied.genres?.length
      ? [...new Set(applied.genres.map((g) => mapOptionId(g, "genres", options)))]
      : spec.genres,
    moods: applied.moods?.length
      ? [...new Set(applied.moods.map((m) => mapOptionId(m, "moods", options)))]
      : spec.moods,
    bpm_range:
      bpmRange && bpmRange.length === 2 ? [bpmRange[0], bpmRange[1]] : spec.bpm_range,
    key: applied.music_params?.key || spec.key,
    tempo_feel: bpmRange ? tempoFromBpmRange(bpmRange) : spec.tempo_feel,
  };
}

/** @deprecated use mergePresetApplied with API response */
export function applyPresetToSpec(spec: MusicCreativeSpec, presetId: string): MusicCreativeSpec {
  return spec;
}

export function mergeParsedSpec(
  current: MusicCreativeSpec,
  parsed: Partial<MusicCreativeSpec>,
  textIntent: string,
): MusicCreativeSpec {
  return {
    ...current,
    instruments: parsed.instruments?.length ? parsed.instruments : current.instruments,
    genres: parsed.genres?.length ? parsed.genres : current.genres,
    moods: parsed.moods?.length ? parsed.moods : current.moods,
    tempo_feel: parsed.tempo_feel || current.tempo_feel,
    bpm: parsed.bpm ?? current.bpm,
    bpm_range: parsed.bpm_range ?? current.bpm_range,
    key: parsed.key && parsed.key !== "auto" ? parsed.key : current.key,
    texture: parsed.texture || current.texture,
    meter: parsed.meter || current.meter,
    era: parsed.era || current.era,
    text_intent: textIntent.trim(),
    custom_prompt_override: "",
  };
}

export const STUDIO_CREATIVE_SPEC_KEY = "studio:creativeSpec";
