import { zh } from "./locales/zh";
import type { Copy } from "./copy-type";

export type { Copy };
export type { CopyType } from "./copy-type";
export type Locale = "zh" | "en";

let enCopy: Copy | null = null;
let enLoadPromise: Promise<Copy> | null = null;

/** Dynamically load English copy (code-split; not in the initial WeApp bundle). */
export function loadEnCopy(): Promise<Copy> {
  if (enCopy) return Promise.resolve(enCopy);
  if (!enLoadPromise) {
    enLoadPromise = import("./locales/en").then((m) => {
      enCopy = m.en;
      return enCopy;
    });
  }
  return enLoadPromise;
}

export function getCopy(locale: Locale): Copy {
  if (locale === "en" && enCopy) return enCopy;
  return zh;
}

export const defaultLocale: Locale = "zh";
export { LOCALE_STORAGE_KEY } from "./LocaleProvider";
export { LocaleProvider, useLocale } from "./LocaleProvider";
export type { LocaleStorage } from "./LocaleProvider";
