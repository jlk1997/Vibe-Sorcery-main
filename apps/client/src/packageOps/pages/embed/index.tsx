import { useEffect, useState } from "react";
import { View, Text, Image } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { usePageTitle } from "../../../hooks/usePageTitle";
import { workToPlayerTrack } from "@vibe-sorcery/types";
import { PlayTrackButton } from "../../../components/player/PlayTrackButton";
import { AiGeneratedBadge } from "../../../components/legal/AiGeneratedBadge";
import { vibeApi } from "../../../services/api";
import "./index.scss";

export default function EmbedPage() {
  const router = useRouter();
  const { copy } = useLocale();
  const e = copy.embedUi;
  usePageTitle(copy.navTitles.embed);
  const workId = router.params.workId || "";
  const [work, setWork] = useState<{ id: string; title: string; audio_url: string; cover_url?: string; hls_url?: string } | null>(null);
  const [brand, setBrand] = useState(copy.brand.name);
  const [logoUrl, setLogoUrl] = useState<string | undefined>();
  const [hidePoweredBy, setHidePoweredBy] = useState(false);

  useEffect(() => {
    if (!workId) return;
    vibeApi.getEmbedWork(workId).then(setWork).catch(() => {});

    async function loadBranding() {
      try {
        if (process.env.TARO_ENV === "h5" && typeof window !== "undefined") {
          const host = window.location.host;
          const byHost = await vibeApi.getEmbedBrandingByHost(host);
          setBrand(byHost.brand || copy.brand.name);
          setLogoUrl(byHost.logo_url);
          setHidePoweredBy(Boolean(byHost.hide_powered_by));
          if (byHost.accent_color && typeof document !== "undefined") {
            document.documentElement.style.setProperty("--embed-accent", byHost.accent_color);
          }
          return;
        }
        const byWork = await vibeApi.getEmbedBranding(workId);
        setBrand(byWork.brand || copy.brand.name);
        setLogoUrl(byWork.logo_url);
        setHidePoweredBy(Boolean(byWork.hide_powered_by));
        if (byWork.accent_color && typeof document !== "undefined") {
          document.documentElement.style.setProperty("--embed-accent", byWork.accent_color);
        }
      } catch {
        /* default branding */
      }
    }
    loadBranding();
  }, [workId, copy.brand.name]);

  if (!work) {
    return (
      <View className="embed">
        <Text className="embed__loading">{e.loading}</Text>
      </View>
    );
  }

  const track = workToPlayerTrack(work);

  return (
    <View className="embed">
      {logoUrl ? <Image className="embed__cover" src={logoUrl} mode="aspectFit" /> : work.cover_url ? <Image className="embed__cover" src={work.cover_url} mode="aspectFill" /> : <View className="embed__cover" />}
      <View className="embed__title-row">
        <Text className="embed__title">{work.title}</Text>
        <AiGeneratedBadge compact />
      </View>
      <PlayTrackButton track={track} label={e.play} />
      {!hidePoweredBy && <Text className="embed__brand embed__brand--accent">{brand}</Text>}
    </View>
  );
}
