import { View, Text } from "@tarojs/components";
import { useLocale } from "@vibe-sorcery/i18n";
import type { MusicCreativeSpec, SoundRecipeOptions, TempoFeel } from "@vibe-sorcery/types";
import { Collapsible, Icon } from "../ui";
import "./SoundRecipePanel.scss";

type Props = {
  spec: MusicCreativeSpec;
  options: SoundRecipeOptions;
  keyOptions: string[];
  bpmPresets?: Array<{ label: string; range: [number, number] }>;
  onChange: (spec: MusicCreativeSpec) => void;
};

function optionLabel(
  opt: { label_zh?: string; label_en?: string; label?: string },
  locale: "zh" | "en",
): string {
  if (locale === "zh") return opt.label_zh || opt.label || opt.label_en || "";
  return opt.label_en || opt.label || opt.label_zh || "";
}

function toggleMulti(values: string[], id: string): string[] {
  return values.includes(id) ? values.filter((v) => v !== id) : [...values, id];
}

export function SoundRecipePanel({ spec, options, keyOptions, bpmPresets = [], onChange }: Props) {
  const { copy, locale } = useLocale();
  const sr = copy.createUi.soundRecipe;

  function patch(partial: Partial<MusicCreativeSpec>) {
    onChange({ ...spec, ...partial });
  }

  function renderChips(
    rowKey: keyof Pick<MusicCreativeSpec, "instruments" | "genres" | "moods">,
    items: SoundRecipeOptions["instruments"],
    multi = true,
  ) {
    const selected = spec[rowKey] as string[];
    return (
      <View className="sound-recipe__chips">
        {items.map((item) => {
          const active = selected.includes(item.id);
          return (
            <View
              key={item.id}
              className={`sound-recipe__chip ${active ? "sound-recipe__chip--active" : ""}`}
              onClick={() => {
                if (multi) {
                  patch({ [rowKey]: toggleMulti(selected, item.id) });
                } else {
                  patch({ [rowKey]: active ? [] : [item.id] });
                }
              }}
            >
              <Text>{optionLabel(item, locale)}</Text>
            </View>
          );
        })}
      </View>
    );
  }

  function renderSingle(
    field: "tempo_feel" | "texture" | "meter" | "era" | "key",
    items: Array<{ id: string; label_zh?: string; label_en?: string; label?: string }>,
  ) {
    const current = spec[field];
    return (
      <View className="sound-recipe__select-row">
        {items.map((item) => {
          const active = current === item.id;
          return (
            <View
              key={item.id}
              className={`sound-recipe__chip ${active ? "sound-recipe__chip--active" : ""}`}
              onClick={() => patch({ [field]: active ? (field === "key" ? "auto" : "") : item.id } as Partial<MusicCreativeSpec>)}
            >
              <Text>{optionLabel(item, locale)}</Text>
            </View>
          );
        })}
      </View>
    );
  }

  const keyItems = keyOptions.map((k) => ({ id: k, label: k === "auto" ? sr.keyAuto : k }));

  function bpmLabel(range: [number, number]) {
    return `${range[0]}-${range[1]}`;
  }

  function isBpmActive(range: [number, number]) {
    return spec.bpm_range?.[0] === range[0] && spec.bpm_range?.[1] === range[1];
  }

  return (
    <View className="sound-recipe">
      <View className="sound-recipe__head">
        <Icon name="music" size="sm" accent />
        <Text className="sound-recipe__title">{sr.title}</Text>
      </View>

      <View className="sound-recipe__row">
        <Text className="sound-recipe__label">{sr.instruments}</Text>
        {renderChips("instruments", options.instruments)}
      </View>

      <View className="sound-recipe__row">
        <Text className="sound-recipe__label">{sr.genres}</Text>
        {renderChips("genres", options.genres)}
      </View>

      <View className="sound-recipe__row">
        <Text className="sound-recipe__label">{sr.tempo}</Text>
        {renderSingle(
          "tempo_feel",
          options.tempo_feel.map((t) => ({ ...t, id: t.id as TempoFeel })),
        )}
      </View>

      <View className="sound-recipe__advanced">
        <Collapsible label={sr.advancedTitle} storageKey="create-sound-recipe-advanced">
          <View className="sound-recipe__row">
            <Text className="sound-recipe__label">{sr.moods}</Text>
            {renderChips("moods", options.moods)}
          </View>
          <View className="sound-recipe__row">
            <Text className="sound-recipe__label">{sr.key}</Text>
            {renderSingle("key", keyItems)}
          </View>
          {bpmPresets.length > 0 && (
            <View className="sound-recipe__row">
              <Text className="sound-recipe__label">{sr.bpm}</Text>
              <View className="sound-recipe__select-row">
                {bpmPresets.map((preset) => {
                  const active = isBpmActive(preset.range);
                  return (
                    <View
                      key={preset.label}
                      className={`sound-recipe__chip ${active ? "sound-recipe__chip--active" : ""}`}
                      onClick={() =>
                        patch({
                          bpm_range: active ? null : preset.range,
                          bpm: null,
                        })
                      }
                    >
                      <Text>{preset.label || bpmLabel(preset.range)}</Text>
                    </View>
                  );
                })}
                {spec.bpm_range && (
                  <View
                    className="sound-recipe__chip sound-recipe__chip--active"
                    onClick={() => patch({ bpm_range: null, bpm: null })}
                  >
                    <Text>{bpmLabel(spec.bpm_range)} · {sr.bpmClear}</Text>
                  </View>
                )}
              </View>
            </View>
          )}
          <View className="sound-recipe__row">
            <Text className="sound-recipe__label">{sr.texture}</Text>
            {renderSingle("texture", options.textures)}
          </View>
          <View className="sound-recipe__row">
            <Text className="sound-recipe__label">{sr.meter}</Text>
            {renderSingle("meter", options.meters)}
          </View>
          <View className="sound-recipe__row">
            <Text className="sound-recipe__label">{sr.era}</Text>
            {renderSingle("era", options.eras)}
          </View>
        </Collapsible>
      </View>
    </View>
  );
}
