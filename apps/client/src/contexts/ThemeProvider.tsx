import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { getItem, setItem } from "../platform/storage";

export type ThemeMood = {
  /** Dominant hue 0-360 for atmosphere orbs */
  hue?: number;
  /** Cover-derived accent hex */
  coverAccent?: string;
  /** Preset theme key */
  presetKey?: string;
  /** AV coordinates for playback */
  arousal?: number;
  valence?: number;
};

type ThemeContextValue = {
  mood: ThemeMood;
  setMood: (patch: Partial<ThemeMood>) => void;
  resetMood: () => void;
};

const DEFAULT_MOOD: ThemeMood = { hue: 42, coverAccent: "#d4af6a" };

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyCssVars(mood: ThemeMood) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (mood.coverAccent) root.style.setProperty("--cover-accent", mood.coverAccent);
  if (mood.hue != null) root.style.setProperty("--atmosphere-hue", String(mood.hue));
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mood, setMoodState] = useState<ThemeMood>(DEFAULT_MOOD);

  const setMood = useCallback((patch: Partial<ThemeMood>) => {
    setMoodState((prev) => {
      const next = { ...prev, ...patch };
      applyCssVars(next);
      return next;
    });
  }, []);

  const resetMood = useCallback(() => {
    setMoodState(DEFAULT_MOOD);
    applyCssVars(DEFAULT_MOOD);
  }, []);

  useEffect(() => {
    applyCssVars(mood);
    const reduced = getItem("settings:reducedMotion") === "1";
    if (reduced && typeof document !== "undefined") {
      document.documentElement.classList.add("reduce-motion");
    }
  }, []);

  const value = useMemo(() => ({ mood, setMood, resetMood }), [mood, setMood, resetMood]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) return { mood: DEFAULT_MOOD, setMood: () => {}, resetMood: () => {} };
  return ctx;
}

/** Extract dominant color from image URL (H5 only). */
export async function extractCoverAccent(url: string): Promise<string | null> {
  if (process.env.TARO_ENV !== "h5" || typeof document === "undefined" || !url) return null;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    const size = 64;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    let r = 0,
      g = 0,
      b = 0,
      n = 0;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha < 128) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
    if (!n) return null;
    r = Math.round(r / n);
    g = Math.round(g / n);
    b = Math.round(b / n);
    return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return null;
  }
}

export function cacheCoverAccent(workId: string, accent: string) {
  setItem(`theme:cover:${workId}`, accent);
}

export function getCachedCoverAccent(workId: string): string | null {
  return getItem(`theme:cover:${workId}`);
}
