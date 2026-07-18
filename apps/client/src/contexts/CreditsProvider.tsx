import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { vibeApi, isUnauthorized } from "../services/api";
import { getToken } from "../platform/storage";

type CreditsContextValue = {
  balance: number | null;
  gateEnabled: boolean;
  loading: boolean;
  ready: boolean;
  isMember: boolean;
  refresh: () => Promise<void>;
  setBalance: (balance: number) => void;
};

const CreditsContext = createContext<CreditsContextValue | null>(null);

export function CreditsProvider({ children }: { children: ReactNode }) {
  const [balance, setBalance] = useState<number | null>(null);
  const [gateEnabled, setGateEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isMember, setIsMember] = useState(false);

  useEffect(() => {
    vibeApi.getFeatureFlags().then((flags) => setGateEnabled(Boolean(flags.credits_gate))).catch((err) => {
      console.warn("[credits] getFeatureFlags failed:", err);
      setGateEnabled(false);
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setBalance(null);
      setIsMember(false);
      return;
    }
    setLoading(true);
    try {
      const [res, sub] = await Promise.all([
        vibeApi.getCredits(),
        vibeApi.getSubscription().catch(() => null),
      ]);
      setBalance(res.balance);
      setIsMember(sub?.status === "active" || sub?.tier === "member");
    } catch (err) {
      if (!isUnauthorized(err)) {
        setBalance(null);
        setIsMember(false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const ready = !loading && balance !== null;

  const value = useMemo(
    () => ({
      balance,
      gateEnabled,
      loading,
      ready,
      isMember,
      refresh,
      setBalance: (next: number) => setBalance(next),
    }),
    [balance, gateEnabled, loading, ready, isMember, refresh]
  );

  return <CreditsContext.Provider value={value}>{children}</CreditsContext.Provider>;
}

export function useCredits() {
  const ctx = useContext(CreditsContext);
  if (!ctx) throw new Error("useCredits must be used within CreditsProvider");
  return ctx;
}

export function useCreditsOptional() {
  return useContext(CreditsContext);
}
