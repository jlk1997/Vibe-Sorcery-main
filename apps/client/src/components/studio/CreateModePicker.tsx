import { View, Text } from "@tarojs/components";
import { useLocale } from "@vibe-sorcery/i18n";
import type { CreateMode } from "./CreateModePicker.types";
import { clsx } from "../../utils/clsx";
import "./CreateModePicker.scss";

export type { CreateMode } from "./CreateModePicker.types";

const MODE_IDS: CreateMode[] = ["quickTrack", "playlist", "lyrics", "remix", "cover", "variation"];

const MODE_EMOJI: Record<CreateMode, string> = {
  quickTrack: "⚡",
  playlist: "🎵",
  lyrics: "✍",
  remix: "⟳",
  cover: "🎤",
  variation: "✦",
};

type Props = {
  value: CreateMode;
  onChange: (mode: CreateMode) => void;
};

export function CreateModePicker({ value, onChange }: Props) {
  const { copy } = useLocale();
  const modes = copy.studioSummary.modes;
  const desc = copy.createUi.modeDesc;

  function modeLabel(id: CreateMode) {
    const map: Record<CreateMode, string> = {
      quickTrack: modes.quickTrack,
      playlist: modes.playlist || "一键歌单",
      lyrics: modes.lyrics,
      remix: modes.remix,
      cover: modes.cover,
      variation: modes.variation,
    };
    return map[id];
  }

  return (
    <View className="mode-picker">
      {MODE_IDS.map((id) => (
        <View
          key={id}
          className={clsx("mode-picker__item", value === id && "mode-picker__item--active", `mode-picker__item--${id}`)}
          onClick={() => onChange(id)}
        >
          <View className="mode-picker__emoji">
            <Text>{MODE_EMOJI[id]}</Text>
          </View>
          <View className="mode-picker__body">
            <Text className="mode-picker__label">{modeLabel(id)}</Text>
            <Text className="mode-picker__desc">{desc[id]}</Text>
          </View>
          {value === id && <View className="mode-picker__check" />}
        </View>
      ))}
    </View>
  );
}
