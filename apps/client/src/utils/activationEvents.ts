import { vibeApi } from "../services/api";
import { getItem, setItem } from "../platform/storage";

const ACTIVATION_EVENTS = [
  "activation_preset_selected",
  "activation_first_generate_start",
  "activation_first_generate_complete",
  "activation_first_listen",
  "activation_first_publish",
] as const;

export type ActivationEvent = (typeof ACTIVATION_EVENTS)[number];

export function trackActivation(event: ActivationEvent, payload?: Record<string, unknown>) {
  return vibeApi.trackEvent(event, payload).catch(() => {});
}

/** Fire activation event at most once per user/device (for funnel steps). */
export function trackActivationOnce(event: ActivationEvent, payload?: Record<string, unknown>) {
  const key = `activation:done:${event}`;
  if (getItem(key)) return Promise.resolve();
  setItem(key, "1");
  return trackActivation(event, payload);
}

export function isActivationEvent(event: string): event is ActivationEvent {
  return (ACTIVATION_EVENTS as readonly string[]).includes(event);
}
