import { useEffect, useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { workToPlayerTrack } from "@vibe-sorcery/types";
import { vibeApi } from "../../services/api";
import { PlayTrackButton } from "../player/PlayTrackButton";
import { Button, StatusLine } from "../ui";
import "./VariationPicker.scss";

type VariationWork = { id: string; title: string; audio_url?: string; hls_url?: string; cover_url?: string };

type Props = {
  jobId: string;
  workIds: string[];
  onPicked?: (workId: string) => void;
};

export function VariationPicker({ jobId, workIds, onPicked }: Props) {
  const { copy } = useLocale();
  const v = copy.variationLab;
  const [works, setWorks] = useState<VariationWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const list = await Promise.all(
          workIds.map(async (id) => {
            try {
              return await vibeApi.getWork(id);
            } catch {
              return { id, title: v.variantLabel.replace("{n}", id.slice(0, 6)), audio_url: "" };
            }
          })
        );
        if (!cancelled) setWorks(list.filter((w) => w.audio_url));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (workIds.length > 1) load();
    else setLoading(false);
    return () => {
      cancelled = true;
    };
  }, [workIds, v.variantLabel]);

  if (workIds.length <= 1) return null;

  async function pickPrimary(workId: string) {
    setPicking(workId);
    try {
      await vibeApi.pickVariationPrimary(jobId, workId);
      setPickedId(workId);
      onPicked?.(workId);
      Taro.showToast({ title: v.pickSuccess, icon: "success" });
    } catch {
      Taro.showToast({ title: v.pickFail, icon: "none" });
    } finally {
      setPicking(null);
    }
  }

  const queue = works
    .filter((w) => w.audio_url)
    .map((w) => workToPlayerTrack(w, { source: "generation" }));

  return (
    <View className="variation-picker">
      <StatusLine tone="info">{v.pickerHint.replace("{n}", String(workIds.length))}</StatusLine>
      {loading && <Text className="typo-meta">{v.loading}</Text>}
      {works.map((w, i) => (
        <View key={w.id} className={`variation-picker__row ${pickedId === w.id ? "variation-picker__row--picked" : ""}`}>
          <Text className="variation-picker__label">{v.variantLabel.replace("{n}", String(i + 1))}</Text>
          <Text className="variation-picker__title">{w.title}</Text>
          <View className="variation-picker__actions">
            {w.audio_url && (
              <PlayTrackButton track={workToPlayerTrack(w, { source: "generation" })} queue={queue} label={v.listen} />
            )}
            <Button size="sm" variant={pickedId === w.id ? "primary" : "secondary"} loading={picking === w.id} onClick={() => pickPrimary(w.id)}>
              {pickedId === w.id ? v.primary : v.pickPrimary}
            </Button>
          </View>
        </View>
      ))}
    </View>
  );
}
