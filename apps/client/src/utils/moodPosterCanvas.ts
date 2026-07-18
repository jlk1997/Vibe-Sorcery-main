/** Draw a shareable mood-shift poster (H5 canvas). */

import { FONT_SANS } from "../styles/fontStacks";
import { drawMoodPoster, type MoodPosterInput } from "./drawMoodPoster";

export type { MoodPosterInput };

export async function renderMoodPosterDataUrl(input: MoodPosterInput): Promise<string | null> {
  if (typeof document === "undefined") return null;

  const w = 600;
  const h = 800;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  drawMoodPoster(ctx, input, w, h, FONT_SANS);
  return canvas.toDataURL("image/png");
}

export async function saveMoodPosterH5(dataUrl: string, fileName = "mood-shift.png"): Promise<void> {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  link.click();
}
