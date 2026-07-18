import { View, Text } from "@tarojs/components";
import { useLocale } from "@vibe-sorcery/i18n";
import { PresetSigil } from "./PresetSigil";
import "./PresetCarousel.scss";

export type StylePreset = {
  id: string;
  label: string;
  category?: string;
  description?: string;
  example_intent?: string;
  member_only?: boolean;
};

type Props = {
  presets: StylePreset[];
  selectedId: string | null;
  onSelect: (preset: StylePreset) => void;
  isMember?: boolean;
  onMemberGate?: () => void;
  className?: string;
};

export function PresetCarousel({ presets, selectedId, onSelect, isMember, onMemberGate, className }: Props) {
  if (!presets.length) return null;
  const { copy } = useLocale();
  const c = copy.createUi;

  function handleSelect(p: StylePreset) {
    if (p.member_only && !isMember) {
      onMemberGate?.();
      return;
    }
    onSelect(p);
  }

  return (
    <View className={className ? `presets ${className}` : "presets"}>
      <View className="presets__scroll">
        {presets.map((p) => {
          const locked = Boolean(p.member_only && !isMember);
          return (
          <View
            key={p.id}
            className={`presets__card ${selectedId === p.id ? "presets__card--active" : ""}${locked ? " presets__card--locked" : ""}`}
            onClick={() => handleSelect(p)}
          >
            <PresetSigil presetId={p.id} size="md" active={selectedId === p.id} />
            <Text className="presets__label">{p.label}</Text>
            {p.member_only && <Text className="presets__member">{c.memberOnlyPreset}</Text>}
            {p.description && <Text className="presets__desc">{p.description}</Text>}
          </View>
        );
        })}
      </View>
    </View>
  );
}
