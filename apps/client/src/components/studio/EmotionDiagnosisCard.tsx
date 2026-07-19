import { useMemo, useState } from "react";
import { View, Text } from "@tarojs/components";
import { useLocale } from "@vibe-sorcery/i18n";
import { Button } from "../ui";
import { EmotionPad } from "./EmotionPad";
import "./EmotionDiagnosisCard.scss";

export type EmotionDiagnosisResult = {
  /** 情绪坐标（1-9），驱动后端 tempo/能量/明暗提示词 */
  arousal: number;
  valence: number;
  intentHint: string;
  /** 由心情选择派生的流派偏置 */
  genres: string[];
  /** 给用户看的结果回显文案 */
  summary: string;
};

type Props = {
  onApply: (result: EmotionDiagnosisResult) => void;
  onDismiss?: () => void;
};

/** 一点即用的心情预设：emoji + 情绪坐标(1-9) + 流派偏置。labels 走 i18n。 */
const PRESETS: { emoji: string; arousal: number; valence: number; genres: string[] }[] = [
  { emoji: "😌", arousal: 2.5, valence: 6, genres: ["ambient"] }, // 放松
  { emoji: "🎯", arousal: 4, valence: 5, genres: ["lo-fi"] }, // 专注
  { emoji: "☀️", arousal: 6.5, valence: 8, genres: ["pop"] }, // 明亮
  { emoji: "🔥", arousal: 8.5, valence: 7, genres: ["electronic"] }, // 热血
  { emoji: "😢", arousal: 3, valence: 2, genres: ["ambient"] }, // 伤感
  { emoji: "🌙", arousal: 3.5, valence: 3.5, genres: ["lo-fi"] }, // 深夜
  { emoji: "💗", arousal: 4.5, valence: 7, genres: ["pop"] }, // 浪漫
  { emoji: "⚡", arousal: 7, valence: 3, genres: ["electronic"] }, // 紧张
];

function band3(v: number): 0 | 1 | 2 {
  if (v <= 3) return 0;
  if (v <= 6) return 1;
  return 2;
}

const BPM_BY_ENERGY = ["60-80 BPM", "85-110 BPM", "115-140 BPM"];
const DOT_COLOR_BY_MOOD = ["#5b6b8f", "#4a9e9e", "#e0b76a"]; // 冷→中→暖

const EMOJI_TABLE = [
  ["😔", "😟", "😣"], // 低沉：舒缓 / 适中 / 高能
  ["😌", "🙂", "😤"], // 中性
  ["😊", "😄", "🤩"], // 明亮
];

/** 没选预设、纯拖动时也给一个流派兜底，保证 genres 不为空 */
function deriveGenres(a: number, v: number): string[] {
  if (a > 6) return ["electronic"];
  if (a <= 3) return v > 6 ? ["pop"] : ["ambient"];
  return ["lo-fi"];
}

export function EmotionDiagnosisCard({ onApply, onDismiss }: Props) {
  const { copy } = useLocale();
  const d = copy.diagnosisUi;
  const [av, setAv] = useState<{ arousal: number; valence: number }>({ arousal: 5, valence: 5 });
  const [selected, setSelected] = useState<number | null>(null);

  const eb = band3(av.arousal);
  const vb = band3(av.valence);
  const dotEmoji = selected !== null ? PRESETS[selected].emoji : EMOJI_TABLE[vb][eb];
  const dotColor = DOT_COLOR_BY_MOOD[vb];

  const summary = useMemo(
    () =>
      d.summaryTemplate
        .replace("{bpm}", BPM_BY_ENERGY[eb])
        .replace("{bright}", d.brightWords[vb] ?? "")
        .replace("{energy}", d.energyWords[eb] ?? ""),
    [d, eb, vb],
  );

  function pickPreset(i: number) {
    setSelected(i);
    setAv({ arousal: PRESETS[i].arousal, valence: PRESETS[i].valence });
  }

  function apply() {
    const genres = selected !== null ? PRESETS[selected].genres : deriveGenres(av.arousal, av.valence);
    const vIdx = Math.max(
      0,
      Math.min(
        d.intentTemplates.length - 1,
        Math.round(((av.valence - 1) / 8) * (d.intentTemplates.length - 1)),
      ),
    );
    const intentHint = d.intentTemplates[vIdx] || d.intentDefault;
    onApply({ arousal: av.arousal, valence: av.valence, intentHint, genres, summary });
  }

  return (
    <View className="emotion-diagnosis">
      <View className="emotion-diagnosis__head">
        <Text className="emotion-diagnosis__title">{d.title}</Text>
        {onDismiss && (
          <Text className="emotion-diagnosis__skip-inline" onClick={onDismiss}>
            {d.skip}
          </Text>
        )}
      </View>
      <Text className="emotion-diagnosis__subtitle">{d.subtitle}</Text>

      <View className="emotion-diagnosis__presets">
        {PRESETS.map((p, i) => (
          <View
            key={i}
            className={`emotion-diagnosis__preset ${selected === i ? "emotion-diagnosis__preset--on" : ""}`}
            onClick={() => pickPreset(i)}
          >
            <Text className="emotion-diagnosis__preset-emoji">{p.emoji}</Text>
            <Text className="emotion-diagnosis__preset-label">{d.presets[i]}</Text>
          </View>
        ))}
      </View>

      <Text className="emotion-diagnosis__drag-hint">{d.padDragHint}</Text>
      <EmotionPad
        value={av}
        onChange={(next) => {
          setAv(next);
          setSelected(null);
        }}
        dotEmoji={dotEmoji}
        dotColor={dotColor}
        labels={{
          energyHigh: d.padEnergyHigh,
          energyLow: d.padEnergyLow,
          moodBright: d.padMoodBright,
          moodDark: d.padMoodDark,
        }}
      />

      <Text className="emotion-diagnosis__summary">{summary}</Text>

      <Button variant="primary" size="md" block onClick={apply}>
        {d.apply}
      </Button>
    </View>
  );
}
