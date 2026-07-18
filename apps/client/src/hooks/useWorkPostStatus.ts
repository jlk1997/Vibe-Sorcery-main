import { useEffect, useState } from "react";
import { resolvePostIdForWork } from "../utils/communityNav";

export function useWorkPostStatus(workId?: string) {
  const [postId, setPostId] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!workId);

  useEffect(() => {
    if (!workId) {
      setPostId(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    resolvePostIdForWork(workId)
      .then((id) => {
        if (!cancelled) setPostId(id);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workId]);

  return { postId, published: !!postId, loading, setPostId };
}
