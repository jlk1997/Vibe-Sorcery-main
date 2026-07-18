import { useEffect, useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { PageShell } from "../../../components/PageShell";
import { Button, LoadingSkeleton } from "../../../components/ui";
import { VariationLab, type VariationWork } from "../../../components/studio/VariationLab";
import { vibeApi } from "../../../services/api";
import { bootstrapAuth, requireAuth } from "../../../utils/auth";
import "./index.scss";

export default function VariationLabPage() {
  const router = useRouter();
  const { copy } = useLocale();
  const v = copy.variationLabUi;
  const jobId = router.params.jobId || "";
  const [works, setWorks] = useState<VariationWork[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    bootstrapAuth();
    if (!jobId || !requireAuth()) {
      setLoading(false);
      return;
    }
    vibeApi
      .getJob(jobId)
      .then(async (job) => {
        const ids = (job.result as { work_ids?: string[] } | undefined)?.work_ids || [];
        if (!ids.length) {
          setWorks([]);
          return;
        }
        const list = await vibeApi.listWorks();
        const mapped = ids
          .map((id) => list.find((w) => w.id === id))
          .filter(Boolean)
          .map((w) => ({
            id: w!.id,
            title: w!.title,
            audio_url: w!.audio_url,
            hls_url: w!.hls_url,
            cover_url: w!.cover_url,
          }));
        setWorks(mapped);
      })
      .catch(() => Taro.showToast({ title: v.pickFail, icon: "none" }))
      .finally(() => setLoading(false));
  }, [jobId, v.pickFail]);

  async function pickPrimary(workId: string) {
    if (!jobId) return;
    setPicking(true);
    try {
      await vibeApi.pickVariationPrimary(jobId, workId);
      setSelectedId(workId);
      Taro.showToast({ title: v.pickSuccess, icon: "success" });
    } catch {
      Taro.showToast({ title: v.pickFail, icon: "none" });
    } finally {
      setPicking(false);
    }
  }

  return (
    <PageShell title={v.title} subtitle={copy.variationLab.subtitle} wide ambient>
      {loading && <LoadingSkeleton count={3} />}
      {!loading && (
        <>
          <VariationLab works={works} selectedId={selectedId} onSelect={setSelectedId} />
          {selectedId && (
            <Button variant="primary" block loading={picking} onClick={() => pickPrimary(selectedId)}>
              {copy.variationLab.pickPrimary}
            </Button>
          )}
        </>
      )}
    </PageShell>
  );
}
