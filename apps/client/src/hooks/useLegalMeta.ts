import { useEffect, useState } from "react";
import { vibeApi } from "../services/api";

export type LegalMeta = {
  company_name?: string;
  contact_email?: string;
  contact_phone?: string;
  icp_number?: string;
  effective_date?: string;
};

let cachedMeta: LegalMeta | null = null;

export function useLegalMeta() {
  const [meta, setMeta] = useState<LegalMeta | null>(cachedMeta);

  useEffect(() => {
    if (cachedMeta) return;
    vibeApi
      .getLegalMeta()
      .then((m) => {
        cachedMeta = m;
        setMeta(m);
      })
      .catch(() => {});
  }, []);

  return meta;
}
