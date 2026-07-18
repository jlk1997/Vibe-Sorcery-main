type ErrorCopy = {
  title: string;
  body: string;
  primary: string;
};

type GenerationErrorsCopy = Record<string, ErrorCopy>;

export function resolveGenerationError(
  errors: GenerationErrorsCopy,
  errorCode: string | null | undefined,
  fallbackMessage?: string | null
): { title: string; body: string; primary: string } {
  if (errorCode && errors[errorCode]) {
    return errors[errorCode];
  }
  const fallback = errors.GENERATION_FAILED;
  return {
    title: fallback?.title || "Generation failed",
    body: fallbackMessage || fallback?.body || "",
    primary: fallback?.primary || "Retry",
  };
}

export function formatQueueWait(
  template: string,
  queueAhead: number,
  estimatedWaitSeconds: number
): string {
  const minutes = Math.max(1, Math.ceil(estimatedWaitSeconds / 60));
  return template.replace("{n}", String(queueAhead)).replace("{m}", String(minutes));
}
