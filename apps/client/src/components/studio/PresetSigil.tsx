import { View } from "@tarojs/components";
import { clsx } from "../../utils/clsx";
import "./PresetSigil.scss";

const SIGIL_PATHS: Record<string, string> = {
  default: "M12 2 L20 8 L18 20 L6 20 L4 8 Z M12 6 L12 16 M8 10 L16 10",
  lofi: "M12 2 C8 6 6 10 6 14 C6 18 8 20 12 22 C16 20 18 18 18 14 C18 10 16 6 12 2 M12 8 L12 16",
  ambient: "M12 3 C6 8 4 12 4 16 C4 20 7 22 12 22 C17 22 20 20 20 16 C20 12 18 8 12 3",
  energetic: "M12 2 L16 10 L22 12 L16 14 L12 22 L8 14 L2 12 L8 10 Z",
  melancholic: "M12 4 C8 8 6 12 6 16 C6 19 8 21 12 21 M12 4 C16 8 18 12 18 16 C18 19 16 21 12 21",
  hopeful: "M12 2 L14 8 L20 8 L15 12 L17 18 L12 14 L7 18 L9 12 L4 8 L10 8 Z",
  cinematic: "M4 6 L20 6 L20 18 L4 18 Z M8 10 L16 10 M8 14 L14 14",
  electronic: "M4 12 L8 8 L12 16 L16 6 L20 12 L20 20 L4 20 Z",
};

type Props = {
  presetId?: string | null;
  size?: "sm" | "md" | "lg";
  active?: boolean;
  className?: string;
};

function sigilForId(id?: string | null): string {
  if (!id) return SIGIL_PATHS.default;
  const key = id.toLowerCase().replace(/[^a-z]/g, "");
  for (const k of Object.keys(SIGIL_PATHS)) {
    if (key.includes(k)) return SIGIL_PATHS[k];
  }
  const keys = Object.keys(SIGIL_PATHS);
  const idx = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % keys.length;
  return SIGIL_PATHS[keys[idx]];
}

/** Alchemical sigil for style presets */
export function PresetSigil({ presetId, size = "md", active, className }: Props) {
  const path = sigilForId(presetId);
  const src = `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${active ? "#d4af6a" : "rgba(212,175,106,0.65)"}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`
  )}`;

  return (
    <View className={clsx("preset-sigil", `preset-sigil--${size}`, active && "preset-sigil--active", className)}>
      <View className="preset-sigil__ring" />
      <View className="preset-sigil__icon" style={{ backgroundImage: `url("${src}")` }} />
    </View>
  );
}
