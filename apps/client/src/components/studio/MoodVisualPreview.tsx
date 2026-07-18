import { useEffect, useState } from "react";
import { View, Text, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { Button } from "../ui";
import { vibeApi } from "../../services/api";
import { useCreditsOptional } from "../../contexts/CreditsProvider";
import { saveVideoFromUrl } from "../../platform/media";
import "./MoodVisualPreview.scss";

type Slide = {
  type: string;
  text?: string;
  image_url?: string;
  caption?: string;
  duration_sec?: number;
  arousal?: number;
  valence?: number;
};

type Props = {
  workId: string;
  onClose?: () => void;
};

export function MoodVisualPreview({ workId, onClose }: Props) {
  const { copy } = useLocale();
  const m = copy.moodVisualUi;
  const creditsCtx = useCreditsOptional();
  const [manifest, setManifest] = useState<Awaited<ReturnType<typeof vibeApi.getMoodVisual>> | null>(null);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [lastDownloadUrl, setLastDownloadUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    vibeApi
      .getMoodVisual(workId)
      .then((res) => {
        setManifest(res);
        setIndex(0);
      })
      .catch(() => setManifest(null))
      .finally(() => setLoading(false));
  }, [workId]);

  useEffect(() => {
    if (!manifest?.slides?.length) return;
    const slide = manifest.slides[index] as Slide;
    const ms = (slide.duration_sec || 3) * 1000;
    const timer = setTimeout(() => {
      setIndex((i) => (i + 1 < manifest.slides.length ? i + 1 : 0));
    }, ms);
    return () => clearTimeout(timer);
  }, [manifest, index]);

  async function exportMp4() {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await vibeApi.exportMoodVisual(workId);
      void creditsCtx?.refresh();
      setLastDownloadUrl(res.download_url);
      if (process.env.TARO_ENV === "weapp") {
        await saveVideoFromUrl(res.download_url);
        Taro.showToast({ title: m.saveVideoSuccess, icon: "success" });
      } else if (process.env.TARO_ENV === "h5") {
        await saveVideoFromUrl(res.download_url);
        Taro.showToast({ title: m.exportSuccess, icon: "success" });
      } else {
        await Taro.setClipboardData({ data: res.download_url });
        Taro.showToast({ title: m.exportSuccess, icon: "success" });
      }
    } catch {
      Taro.showToast({ title: m.exportFail, icon: "none" });
    } finally {
      setExporting(false);
    }
  }

  if (loading) return <Text className="typo-meta">{m.loading}</Text>;
  if (!manifest?.slides?.length) return <Text className="typo-meta">{m.empty}</Text>;

  const slide = manifest.slides[index] as Slide;

  return (
    <View className="mood-visual">
      <Text className="mood-visual__title">{m.title}</Text>
      <View className="mood-visual__stage">
        {slide.type === "cover" && slide.image_url && (
          <Image className="mood-visual__cover" src={slide.image_url} mode="aspectFill" />
        )}
        {slide.type === "lyric" && <Text className="mood-visual__lyric">{slide.text}</Text>}
        {slide.type === "moods" && <Text className="mood-visual__moods">{slide.text}</Text>}
        {slide.type === "emotion" && (
          <Text className="mood-visual__emotion">
            A{slide.arousal ?? "—"} · V{slide.valence ?? "—"}
          </Text>
        )}
        {slide.caption && <Text className="typo-meta">{slide.caption}</Text>}
      </View>
      <Text className="typo-meta">
        {index + 1} / {manifest.slides.length}
      </Text>
      <Button variant="secondary" size="sm" block loading={exporting} onClick={() => void exportMp4()}>
        {m.exportMp4}
      </Button>
      {lastDownloadUrl && (
        <Button
          variant="ghost"
          size="sm"
          block
          loading={saving}
          onClick={async () => {
            if (!lastDownloadUrl) return;
            setSaving(true);
            try {
              await saveVideoFromUrl(lastDownloadUrl);
              Taro.showToast({ title: m.saveVideoSuccess, icon: "success" });
            } catch {
              Taro.showToast({ title: m.saveVideoFail, icon: "none" });
            } finally {
              setSaving(false);
            }
          }}
        >
          {m.saveVideo}
        </Button>
      )}
      {creditsCtx?.isMember && <Text className="typo-meta">{m.exportMemberFree}</Text>}
      {onClose && (
        <Button variant="ghost" size="sm" block onClick={onClose}>
          {m.close}
        </Button>
      )}
    </View>
  );
}
