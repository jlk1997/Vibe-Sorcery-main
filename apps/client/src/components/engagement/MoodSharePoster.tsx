import { View, Text, Canvas } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { MoodShiftViz, Button } from "../ui";
import { renderMoodPosterDataUrl, saveMoodPosterH5 } from "../../utils/moodPosterCanvas";
import { saveMoodPosterWeapp } from "../../utils/moodPosterWeapp";
import "./MoodSharePoster.scss";

type Props = {
  title: string;
  before: number;
  after: number;
};

export function MoodSharePoster({ title, before, after }: Props) {
  const { copy } = useLocale();
  const f = copy.feedbackUi;
  const b = copy.brand;
  const isWeapp = process.env.TARO_ENV === "weapp";
  const isH5 = process.env.TARO_ENV === "h5";

  function posterInput() {
    const beforeLabel = f.moodScale[Math.max(0, Math.min(f.moodScale.length - 1, before - 1))];
    const afterLabel = f.moodScale[Math.max(0, Math.min(f.moodScale.length - 1, after - 1))];
    return {
      title,
      before,
      after,
      beforeLabel,
      afterLabel,
      beforeTitle: f.beforeSection,
      afterTitle: f.afterSection,
      brandName: b.fullName,
      deltaLabel: f.posterDelta,
    };
  }

  async function savePoster() {
    try {
      if (isH5) {
        const dataUrl = await renderMoodPosterDataUrl(posterInput());
        if (!dataUrl) throw new Error("canvas");
        await saveMoodPosterH5(dataUrl);
      } else if (isWeapp) {
        await saveMoodPosterWeapp("mood-poster-canvas", posterInput());
      } else {
        Taro.showToast({ title: f.share, icon: "none" });
        return;
      }
      Taro.showToast({ title: f.posterSaved, icon: "success" });
    } catch {
      Taro.showToast({ title: f.posterFail, icon: "none" });
    }
  }

  return (
    <View className="mood-poster">
      <Text className="mood-poster__brand">{b.fullName}</Text>
      <Text className="mood-poster__title">{title}</Text>
      <MoodShiftViz
        before={before}
        after={after}
        labels={f.moodScale}
        beforeTitle={f.beforeSection}
        afterTitle={f.afterSection}
      />
      <Text className="mood-poster__tagline">{f.posterTagline}</Text>
      <Text className="mood-poster__watermark">{b.fullName} · AI 音乐</Text>
      {isWeapp && (
        <Canvas type="2d" id="mood-poster-canvas" className="mood-poster__canvas" />
      )}
      {(isH5 || isWeapp) && (
        <Button variant="secondary" size="sm" block onClick={() => void savePoster()}>
          {f.savePoster}
        </Button>
      )}
    </View>
  );
}
