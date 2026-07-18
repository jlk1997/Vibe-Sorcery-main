import { useState } from "react";
import { View, Text } from "@tarojs/components";
import { useLocale } from "@vibe-sorcery/i18n";
import { Button, ChipGroup } from "../ui";
import "./EmotionDiagnosisCard.scss";

type Props = {
  onApply: (result: { arousal: number; valence: number; intentHint: string; presetHint?: string }) => void;
  onDismiss?: () => void;
};

const QUESTION_KEYS = ["energy", "mood", "scene"] as const;

export function EmotionDiagnosisCard({ onApply, onDismiss }: Props) {
  const { copy } = useLocale();
  const d = copy.diagnosisUi;
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});

  const questions = [
    { key: "energy", label: d.qEnergy, options: d.energyOptions },
    { key: "mood", label: d.qMood, options: d.moodOptions },
    { key: "scene", label: d.qScene, options: d.sceneOptions },
  ] as const;

  const current = questions[step];
  const done = step >= questions.length;

  function select(value: number) {
    const next = { ...answers, [current.key]: value };
    setAnswers(next);
    if (step < questions.length - 1) {
      setStep(step + 1);
      return;
    }
    const arousal = Math.round(((next.energy ?? 3) + (next.scene ?? 3)) / 2);
    const valence = next.mood ?? 3;
    const intentHint = d.intentTemplates[Math.min(valence - 1, d.intentTemplates.length - 1)] || d.intentDefault;
    const presetHint = valence >= 4 && arousal >= 4 ? "energetic" : valence <= 2 ? "melancholy" : arousal <= 2 ? "calm" : undefined;
    onApply({ arousal, valence, intentHint, presetHint });
  }

  if (done) return null;

  return (
    <View className="emotion-diagnosis">
      <View className="emotion-diagnosis__head">
        <Text className="emotion-diagnosis__title">{d.title}</Text>
        <Text className="emotion-diagnosis__step">{d.step.replace("{n}", String(step + 1)).replace("{total}", String(questions.length))}</Text>
      </View>
      <Text className="emotion-diagnosis__q">{current.label}</Text>
      <ChipGroup
        options={current.options.map((opt, i) => ({ value: String(i + 1), label: opt }))}
        value={answers[current.key] ? String(answers[current.key]) : ""}
        onChange={(v) => select(Number(v))}
      />
      {step > 0 && (
        <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}>
          {d.back}
        </Button>
      )}
      {onDismiss && (
        <Text className="emotion-diagnosis__skip" onClick={onDismiss}>
          {d.skip}
        </Text>
      )}
    </View>
  );
}
