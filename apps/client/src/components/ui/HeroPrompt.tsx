import { View, Text, Textarea } from "@tarojs/components";
import { clsx } from "../../utils/clsx";
import "./HeroPrompt.scss";

type Props = {
  label?: string;
  hint?: string;
  value: string;
  placeholder?: string;
  maxlength?: number;
  variant?: "default" | "ritual";
  onInput: (value: string) => void;
  className?: string;
};

/** 创作首页大 Prompt 输入 — 玻璃态深色风格 */
export function HeroPrompt({
  label,
  hint,
  value,
  placeholder,
  maxlength = 300,
  variant = "default",
  onInput,
  className,
}: Props) {
  return (
    <View className={clsx("ui-hero-prompt", variant === "ritual" && "ui-hero-prompt--ritual", className)}>
      {label && <Text className="ui-hero-prompt__label">{label}</Text>}
      <View className="ui-hero-prompt__box">
        <Textarea
          className="ui-hero-prompt__input"
          value={value}
          placeholder={placeholder}
          maxlength={maxlength}
          autoHeight
          onInput={(e) => onInput(e.detail.value)}
        />
      </View>
      <View className="ui-hero-prompt__footer">
        {hint && <Text className="ui-hero-prompt__hint">{hint}</Text>}
        <Text className="ui-hero-prompt__count">
          {value.length}/{maxlength}
        </Text>
      </View>
    </View>
  );
}
