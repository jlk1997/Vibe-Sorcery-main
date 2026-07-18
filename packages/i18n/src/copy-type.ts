import type { zh } from "./locales/zh";

type DeepString<T> = T extends string ? string : T extends object ? { [K in keyof T]: DeepString<T[K]> } : T;

export type Copy = DeepString<typeof zh>;
