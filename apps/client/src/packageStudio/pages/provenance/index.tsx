import { useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro, { useRouter, useDidShow, useShareAppMessage } from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { PageShell } from "../../../components/PageShell";
import { LineageNode } from "../../../components/community/LineageNode";
import { AiGeneratedBadge } from "../../../components/legal/AiGeneratedBadge";
import { Button, ChipGroup, Collapsible, EmptyState, Icon, LoadingSkeleton, ProvenanceTimeline, RingGauge, StatPill } from "../../../components/ui";
import { vibeApi } from "../../../services/api";
import { bootstrapAuth } from "../../../utils/auth";
import { shareWork, workSharePayload } from "../../../platform/share";
import "./index.scss";

type Tab = "lineage" | "remix";

type TreeNode = { id: string; title: string; author?: string; children?: TreeNode[] };

export default function ProvenancePage() {
  const router = useRouter();
  const { copy } = useLocale();
  const pv = copy.provenanceUi;
  const workId = router.params.workId || "";
  const isWeapp = process.env.TARO_ENV === "weapp";

  useShareAppMessage(() => workSharePayload(workId, pv.pageTitle));

  const [lineage, setLineage] = useState<Array<Record<string, unknown>>>([]);
  const [remixTree, setRemixTree] = useState<TreeNode | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [pipeline, setPipeline] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("lineage");
  const [derivatives, setDerivatives] = useState<Array<{ id: string; title: string }>>([]);

  useDidShow(async () => {
    if (!workId) return;
    bootstrapAuth();
    setLoading(true);
    try {
      const [prov, verify, tree, derivs] = await Promise.all([
        vibeApi.getProvenance(workId),
        vibeApi.verifyProvenance(workId).catch(() => ({ verified: false })),
        vibeApi.getRemixTree(workId).catch(() => null),
        vibeApi.getDerivatives(workId).catch(() => []),
      ]);
      setLineage(prov.lineage || []);
      setPipeline(prov.pipeline_version || "");
      setVerified(Boolean(verify.verified));
      setRemixTree(tree as TreeNode | null);
      setDerivatives(derivs);
    } catch {
      Taro.showToast({ title: pv.loadFail, icon: "none" });
    } finally {
      setLoading(false);
    }
  });

  async function exportProv() {
    if (process.env.TARO_ENV !== "h5") {
      Taro.showToast({ title: pv.exportH5Only, icon: "none" });
      return;
    }
    try {
      const blob = await vibeApi.exportProvenance(workId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `provenance-${workId}.vibe.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      Taro.showToast({ title: pv.exportFail, icon: "none" });
    }
  }

  const trustScore = verified === true ? 100 : verified === false ? 0 : 50;
  const trustLabel = verified === true ? pv.verifiedOk : verified === false ? pv.verifiedFail : pv.verifiedUnknown;

  return (
    <PageShell label={pv.shellLabel} title={pv.pageTitle} subtitle={pv.pageSubtitle} wide immersive ambient ambientVariant="warm">
      <AiGeneratedBadge className="prov-ai-badge" prominent />
      {loading && <LoadingSkeleton count={4} variant="line" />}
      {!loading && (
        <View className="prov-trust">
          <RingGauge value={trustScore} max={100} label={pv.verifyTitle} sublabel={trustLabel} />
          {pipeline && <StatPill label={`${pv.pipeline} ${pipeline}`} variant="muted" />}
        </View>
      )}

      <ChipGroup
        options={[
          { value: "lineage", label: pv.tabLineage },
          { value: "remix", label: pv.tabRemixTree },
        ]}
        value={tab}
        onChange={setTab}
      />

      {!loading && tab === "lineage" && lineage.length === 0 && <EmptyState iconName="search" title={pv.emptyLineage} />}
      {tab === "lineage" && lineage.length > 0 && (
        <ProvenanceTimeline steps={lineage} stepLabel={pv.step} modelLabel={pv.modelLabel} />
      )}

      {tab === "remix" && remixTree && (
        <View className="prov-tree-wrap">
          <LineageNode node={remixTree} currentId={workId} />
        </View>
      )}
      {tab === "remix" && !remixTree && !loading && <EmptyState iconName="remix" title={pv.emptyRemix} />}

      {derivatives.length > 0 && (
        <View className="prov-derivatives">
          <Text className="prov-derivatives__title">{copy.derivativesUi.title}</Text>
          {derivatives.map((d) => (
            <View
              key={d.id}
              className="prov-derivative-chip"
              onClick={() => Taro.navigateTo({ url: `/pages/provenance/index?workId=${d.id}` })}
            >
              <Icon name="remix" size="sm" accent />
              <Text>{d.title}</Text>
            </View>
          ))}
        </View>
      )}

      {!loading && (
        <Collapsible label={pv.techDetails}>
          {lineage.map((step, i) => (
            <Text key={i} className="prov-tech-line">
              {JSON.stringify(step).slice(0, 120)}…
            </Text>
          ))}
        </Collapsible>
      )}

      {!loading && (
        <Button
          variant="ghost"
          block
          openType={isWeapp ? "share" : undefined}
          onClick={() => shareWork(workId, pv.pageTitle)}
          className="prov-share-btn"
        >
          {pv.shareLineage}
        </Button>
      )}

      {!loading && (
        <Button variant="secondary" block onClick={exportProv} className="prov-export-btn">
          {pv.exportVibe}
        </Button>
      )}
    </PageShell>
  );
}
