import { View, Text, Input as TaroInput } from "@tarojs/components";
import { BottomSheet, Button, Icon } from "../ui";
import "./WorkTitleSheet.scss";

type Props = {
  open: boolean;
  title: string;
  sheetTitle: string;
  body: string;
  label: string;
  placeholder: string;
  hint: string;
  suggestLabel: string;
  suggestedTitle: string;
  skipLabel: string;
  confirmLabel: string;
  loading?: boolean;
  onTitleChange: (value: string) => void;
  onUseSuggested: () => void;
  onSkip: () => void;
  onConfirm: () => void;
  onClose: () => void;
};

export function WorkTitleSheet({
  open,
  title,
  sheetTitle,
  body,
  label,
  placeholder,
  hint,
  suggestLabel,
  suggestedTitle,
  skipLabel,
  confirmLabel,
  loading,
  onTitleChange,
  onUseSuggested,
  onSkip,
  onConfirm,
  onClose,
}: Props) {
  return (
    <BottomSheet
      open={open}
      title={sheetTitle}
      onClose={onClose}
      footer={
        <View className="work-title-sheet__footer">
          <Button variant="ghost" block disabled={loading} onClick={onSkip}>
            {skipLabel}
          </Button>
          <Button variant="primary" block loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </View>
      }
    >
      <View className="work-title-sheet">
        <View className="work-title-sheet__hero">
          <View className="work-title-sheet__icon">
            <Icon name="music" size="md" accent />
          </View>
          <Text className="work-title-sheet__body">{body}</Text>
        </View>

        {suggestedTitle && (
          <View className="work-title-sheet__suggest" onClick={onUseSuggested}>
            <Text className="work-title-sheet__suggest-label">{suggestLabel}</Text>
            <Text className="work-title-sheet__suggest-value">{suggestedTitle}</Text>
          </View>
        )}

        <View className="work-title-sheet__field">
          <Text className="work-title-sheet__label">{label}</Text>
          <View className="work-title-sheet__input-wrap">
            <TaroInput
              className="work-title-sheet__input"
              value={title}
              placeholder={placeholder}
              maxlength={60}
              focus={open}
              onInput={(e) => onTitleChange(e.detail.value)}
              onConfirm={onConfirm}
            />
          </View>
          <Text className="work-title-sheet__hint">{hint}</Text>
        </View>
      </View>
    </BottomSheet>
  );
}
