import type { MusicCreativeSpec, SoundRecipeOptions } from "@vibe-sorcery/types";

export const WORK_TITLE_MAX = 60;
export const WORK_TITLE_SUGGEST_MAX = 14;

/** Short phrase for sheet suggestion / default title (not the full prompt). */
export function suggestTitleFromIntent(intent: string, maxLen = WORK_TITLE_SUGGEST_MAX): string {
  const trimmed = intent.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";

  const firstClause = trimmed.split(/[，,。；;、!\?！？\n]/)[0]?.trim() || trimmed;
  if (firstClause.length <= maxLen) return firstClause;

  return `${firstClause.slice(0, maxLen)}…`;
}

export function suggestTitleFromSpec(
  spec: MusicCreativeSpec,
  options: SoundRecipeOptions,
  locale: "zh" | "en",
  maxLen = WORK_TITLE_SUGGEST_MAX,
): string {
  const parts: string[] = [];
  const pickLabel = (item?: { label_zh?: string; label_en?: string; id: string }) => {
    if (!item) return "";
    if (locale === "zh") return item.label_zh || item.label_en || item.id;
    return item.label_en || item.label_zh || item.id;
  };

  if (spec.instruments[0]) {
    parts.push(pickLabel(options.instruments.find((i) => i.id === spec.instruments[0])));
  }
  if (spec.genres[0]) {
    parts.push(pickLabel(options.genres.find((g) => g.id === spec.genres[0])));
  }
  if (spec.moods[0] && parts.length < 2) {
    parts.push(pickLabel(options.moods.find((m) => m.id === spec.moods[0])));
  }

  const joined = parts.filter(Boolean).join(" · ");
  if (!joined) return "";
  return joined.length <= maxLen ? joined : `${joined.slice(0, maxLen)}…`;
}

export function resolveWorkTitle(
  explicit: string,
  intent: string,
  fallback: string,
  opts?: {
    spec?: MusicCreativeSpec;
    soundRecipe?: SoundRecipeOptions | null;
    locale?: "zh" | "en";
  },
): string {
  const named = explicit.trim();
  if (named) return named.slice(0, WORK_TITLE_MAX);

  const fromIntent = suggestTitleFromIntent(intent);
  if (fromIntent && fromIntent.length <= WORK_TITLE_SUGGEST_MAX + 1) {
    return fromIntent;
  }

  if (opts?.spec && opts.soundRecipe) {
    const fromSpec = suggestTitleFromSpec(opts.spec, opts.soundRecipe, opts.locale || "zh");
    if (fromSpec) return fromSpec;
  }

  if (fromIntent) return fromIntent;
  return fallback;
}
