import { useCallback, useEffect, useState } from "react";

type Options = {
  /** Run load on mount (default true). */
  immediate?: boolean;
};

export function useAsyncQuery<T>(loader: () => Promise<T>, deps: unknown[] = [], opts?: Options) {
  const immediate = opts?.immediate !== false;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await loader();
      setData(result);
      return result;
    } catch {
      setError(true);
      setData(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => {
    if (immediate) void reload();
  }, [reload, immediate]);

  return { data, loading, error, reload, setData };
}
