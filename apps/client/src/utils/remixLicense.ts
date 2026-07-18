/** Whether a work may be remixed per owner license flags. */
export function canRemixWork(work?: { allow_remix?: boolean; license?: string | null } | null): boolean {
  if (!work) return false;
  if (work.allow_remix === false) return false;
  const license = (work.license || "allow_remix").toLowerCase();
  return license !== "no_derivatives" && license !== "no_remix";
}
