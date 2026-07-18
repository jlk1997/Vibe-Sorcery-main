import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { useActiveJobOptional } from "../contexts/ActiveJobProvider";
import { currentPageRoute, isTabUrl } from "../constants/routes";
import { useRouteTick } from "../hooks/useRouteTick";
import { canPreview } from "../utils/generationPhases";
import { Icon } from "./ui";
import "./GlobalJobBanner.scss";

const HIDE_BANNER_STATUSES = new Set(["cancelled"]);

function phaseIcon(phase?: string | null, status?: string): "music" | "create" | "journey" | "remix" {
  if (!phase) return "create";
  if (status === "post_processing" || phase === "post_processing") return "create";
  if (phase === "composing" || phase.startsWith("track_")) return "music";
  if (phase === "audio_ready") return "music";
  if (phase === "cover" || phase === "provenance" || phase === "hls" || phase === "waveform") return "create";
  return "journey";
}

export function GlobalJobBanner() {
  const { copy } = useLocale();
  const g = copy.generation;
  const ctx = useActiveJobOptional();
  useRouteTick();
  const job = ctx?.job;

  if (!job || HIDE_BANNER_STATUSES.has(job.status)) return null;

  const isCompleted = job.status === "completed";
  const isFailed = job.status === "failed";

  const currentPath = currentPageRoute();
  const jobPath = job.returnUrl.split("?")[0].replace(/^\//, "");
  if (currentPath && (currentPath === jobPath || currentPath.endsWith(jobPath))) return null;

  const previewBadge =
    isCompleted || canPreview(job.phase, job.workId ? { work_id: job.workId, audio_url: "ready" } : null);

  function openJob() {
    if (job?.returnUrl.startsWith("/pages/") && isTabUrl(job.returnUrl)) {
      Taro.switchTab({ url: job.returnUrl.split("?")[0] });
      return;
    }
    Taro.navigateTo({ url: job!.returnUrl }).catch(() => {
      Taro.reLaunch({ url: job!.returnUrl });
    });
  }

  const phaseKey = job.phase?.startsWith("track_") ? "track" : job.phase || "";
  const phaseLabel = phaseKey ? (g.phases as Record<string, string>)[phaseKey] || phaseKey : "";

  const bannerText = isFailed
    ? job.message || g.failed
    : isCompleted
      ? g.bannerCompleted
      : job.message || g.bannerRunning;

  return (
    <View className={`global-job-banner${isFailed ? " global-job-banner--failed" : ""}`} onClick={openJob}>
      <View className="global-job-banner__bar">
        <View
          className={`global-job-banner__fill${isFailed ? " global-job-banner__fill--failed" : ""}`}
          style={{ width: `${isFailed ? 100 : job.progress}%` }}
        />
      </View>
      <View className="global-job-banner__row">
        <Icon name={isFailed ? "create" : phaseIcon(job.phase, job.status)} size="sm" accent={!isFailed} />
        <View className="global-job-banner__text-wrap">
          <Text className={`global-job-banner__text${isFailed ? " global-job-banner__text--failed" : ""}`}>
            {bannerText}
          </Text>
          {job.remixSourceTitle ? (
            <Text className="global-job-banner__remix">
              {g.remixBasedOn.replace("{title}", job.remixSourceTitle)}
            </Text>
          ) : null}
          {phaseLabel && !isFailed ? <Text className="global-job-banner__phase">{phaseLabel}</Text> : null}
        </View>
        {isFailed ? (
          <Text className="global-job-banner__badge global-job-banner__badge--failed">{g.retry}</Text>
        ) : previewBadge ? (
          <Text className="global-job-banner__badge">{g.bannerPreview}</Text>
        ) : (
          <Text className="global-job-banner__pct">{job.progress}%</Text>
        )}
      </View>
    </View>
  );
}
