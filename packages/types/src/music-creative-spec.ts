export type TempoFeel = "" | "slow" | "medium" | "fast";

export type MusicCreativeSpec = {
  instruments: string[];
  genres: string[];
  moods: string[];
  tempo_feel: TempoFeel;
  bpm?: number | null;
  bpm_range?: [number, number] | null;
  key: string;
  texture: string;
  meter: string;
  era: string;
  text_intent: string;
  style_tags: string;
  journey_hint?: string;
  custom_prompt_override?: string;
  /** 情绪能量 (1-9)，越高越激烈。来自情绪诊断/情绪盘，驱动 tempo 与能量描述词。 */
  arousal?: number | null;
  /** 情绪明暗 (1-9)，越高越明亮愉悦。来自情绪诊断/情绪盘，驱动明暗氛围描述词。 */
  valence?: number | null;
};

export type SoundRecipeOption = {
  id: string;
  label_zh?: string;
  label_en?: string;
  token?: string;
  label?: string;
};

export type SoundRecipeOptions = {
  instruments: SoundRecipeOption[];
  genres: SoundRecipeOption[];
  moods: SoundRecipeOption[];
  tempo_feel: SoundRecipeOption[];
  textures: SoundRecipeOption[];
  meters: SoundRecipeOption[];
  eras: SoundRecipeOption[];
};

export function emptyCreativeSpec(): MusicCreativeSpec {
  return {
    instruments: [],
    genres: [],
    moods: [],
    tempo_feel: "",
    key: "auto",
    texture: "",
    meter: "",
    era: "",
    text_intent: "",
    style_tags: "",
  };
}
