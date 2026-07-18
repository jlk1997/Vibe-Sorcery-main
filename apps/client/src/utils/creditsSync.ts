type CreditsCtx = {
  refresh: () => Promise<void>;
  setBalance?: (balance: number) => void;
} | null | undefined;

export type CreditsApiPayload = {
  credits_balance?: number | null;
  task_reward?: { credits_granted?: number; balance?: number; duplicate?: boolean } | null;
};

export function applyCreditsResponse(creditsCtx: CreditsCtx, res?: CreditsApiPayload | null) {
  const balance = res?.credits_balance ?? res?.task_reward?.balance;
  if (balance != null && creditsCtx?.setBalance) {
    creditsCtx.setBalance(balance);
    return;
  }
  void creditsCtx?.refresh();
}

export async function ensureSufficientCredits(
  creditsCtx: (CreditsCtx & { gateEnabled?: boolean; ready?: boolean; balance?: number | null }) | null | undefined,
  cost: number,
  onInsufficient: () => void | Promise<void>
): Promise<boolean> {
  if (!creditsCtx?.gateEnabled) return true;
  if (!creditsCtx.ready) await creditsCtx.refresh();
  const balance = creditsCtx.balance;
  if (balance == null || balance < cost) {
    await onInsufficient();
    return false;
  }
  return true;
}

export function taskCreditsGranted(res?: CreditsApiPayload | null): number | null {
  const reward = res?.task_reward;
  if (!reward || reward.duplicate) return null;
  const granted = reward.credits_granted;
  return granted != null && granted > 0 ? granted : null;
}
