import { useEffect } from "react";
import { View, Text, Textarea } from "@tarojs/components";
import { Icon } from "../ui";
import "./CreateFormulaPanel.scss";

const FORMULA_INPUT_SELECTOR = ".create-formula__input-wrap textarea, .create-formula__input-wrap .taro-textarea";
const isH5 = process.env.TARO_ENV === "h5";

function syncFormulaTextareaHeight() {
  if (!isH5 || typeof document === "undefined") return;
  const el = document.querySelector(FORMULA_INPUT_SELECTOR) as HTMLTextAreaElement | null;
  if (!el) return;
  el.style.height = "auto";
  const minPx = 120;
  const maxPx = 320;
  const next = Math.min(Math.max(el.scrollHeight, minPx), maxPx);
  el.style.height = `${next}px`;
}

type Props = {
  intentLabel: string;
  intentHint: string;
  intentPlaceholder: string;
  textIntent: string;
  onTextIntentChange: (value: string) => void;
  polishLabel: string;
  polishingLabel: string;
  polishing?: boolean;
  onPolish?: () => void;
  intentTip?: string;
  maxlength?: number;
  onIntentBlur?: () => void;
};

export function CreateFormulaPanel({
  intentLabel,
  intentHint,
  intentPlaceholder,
  textIntent,
  onTextIntentChange,
  polishLabel,
  polishingLabel,
  polishing = false,
  onPolish,
  intentTip,
  maxlength = 300,
  onIntentBlur,
}: Props) {
  useEffect(() => {
    syncFormulaTextareaHeight();
    const timer = setTimeout(syncFormulaTextareaHeight, 0);
    return () => clearTimeout(timer);
  }, [textIntent]);

  return (
    <View className="create-formula">
      <View className="create-formula__glow" aria-hidden />

      <View className="create-formula__head">
        <View className="create-formula__head-left">
          <View className="create-formula__sigil">
            <Icon name="flask" size="sm" accent />
          </View>
          <Text className="create-formula__title">{intentLabel}</Text>
        </View>
        {onPolish && (
          <View
            className={`create-formula__polish ${polishing ? "create-formula__polish--loading" : ""}`}
            onClick={polishing ? undefined : onPolish}
          >
            <Icon name="sparkle" size="sm" accent />
            <Text className="create-formula__polish-text">{polishing ? polishingLabel : polishLabel}</Text>
          </View>
        )}
      </View>

      <View className="create-formula__prompt">
        <View className="create-formula__input-wrap">
          <Textarea
            className="create-formula__input"
            value={textIntent}
            placeholder={intentPlaceholder}
            maxlength={maxlength}
            autoHeight={!isH5}
            disableDefaultPadding
            onInput={(e) => {
              onTextIntentChange(e.detail.value);
              if (isH5) {
                requestAnimationFrame(syncFormulaTextareaHeight);
              }
            }}
            onBlur={() => onIntentBlur?.()}
          />
        </View>
        <View className="create-formula__prompt-foot">
          <Text className="create-formula__hint">{intentHint}</Text>
          <Text className="create-formula__count">
            {textIntent.length}/{maxlength}
          </Text>
        </View>
      </View>

      {intentTip && (
        <View className="create-formula__tip">
          <Icon name="info" size="sm" accent />
          <Text className="create-formula__tip-text">{intentTip}</Text>
        </View>
      )}
    </View>
  );
}
