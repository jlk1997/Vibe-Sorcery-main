/** Minimal className joiner — avoids adding clsx dependency */
export function clsx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
