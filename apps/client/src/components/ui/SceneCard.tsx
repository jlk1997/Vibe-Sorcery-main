import { View, Text } from "@tarojs/components";
import { Button } from "./Button";
import { clsx } from "../../utils/clsx";
import "./SceneCard.scss";

type Props = {
  emoji: string;
  emojiEnd?: string;
  label: string;
  description: string;
  actionLabel: string;
  tone?: "calm" | "hope" | "peace";
  loading?: boolean;
  onAction: () => void;
};

const TONE_CLASS = {
  calm: "ui-scene-card--calm",
  hope: "ui-scene-card--hope",
  peace: "ui-scene-card--peace",
} as const;

export function SceneCard({ emoji, emojiEnd, label, description, actionLabel, tone = "calm", loading, onAction }: Props) {
  return (
    <View className={clsx("ui-scene-card", TONE_CLASS[tone])}>
      <View className="ui-scene-card__visual">
        <Text className="ui-scene-card__emoji">{emoji}</Text>
        <View className="ui-scene-card__arc">
          <View className="ui-scene-card__arc-dot ui-scene-card__arc-dot--start" />
          <View className="ui-scene-card__arc-line" />
          <View className="ui-scene-card__arc-dot ui-scene-card__arc-dot--end" />
        </View>
        <Text className="ui-scene-card__emoji ui-scene-card__emoji--end">{emojiEnd || "✨"}</Text>
      </View>
      <Text className="ui-scene-card__label">{label}</Text>
      <Text className="ui-scene-card__desc">{description}</Text>
      <Button variant="secondary" size="sm" loading={loading} onClick={onAction}>
        {actionLabel}
      </Button>
    </View>
  );
}
