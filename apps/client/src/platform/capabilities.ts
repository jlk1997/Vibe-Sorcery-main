/** Platform capability flags for progressive enhancement */

export const capabilities = {
  webFonts: process.env.TARO_ENV === "h5",
  canvasColorPick: process.env.TARO_ENV === "h5" && typeof document !== "undefined",
  backdropBlur: process.env.TARO_ENV === "h5",
  particleAnimation: process.env.TARO_ENV === "h5",
  reducedMotionDefault: false,
} as const;

export type PlatformCapabilities = typeof capabilities;
