import { useEffect, useRef, useState } from "react";
import { View, Text, Textarea } from "@tarojs/components";
import { useLocale } from "@vibe-sorcery/i18n";
import type { MusicCreativeSpec } from "@vibe-sorcery/types";
import { vibeApi } from "../../services/api";
import { Icon } from "../ui";
import "./PromptPreviewBar.scss";

type Props = {
  spec: MusicCreativeSpec;
  textIntent: string;
  styleTags?: string;
  debounceMs?: number;
  onOverrideChange?: (override: string) => void;
};

export function PromptPreviewBar({
  spec,
  textIntent,
  styleTags = "",
  debounceMs = 500,
  onOverrideChange,
}: Props) {
  const { copy } = useLocale();
  const pv = copy.createUi.promptPreview;
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [rawPrompt, setRawPrompt] = useState("");
  const editingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setLoading(true);
      vibeApi
        .previewMusicPrompt({
          creative_spec: {
            ...spec,
            text_intent: textIntent.trim(),
            style_tags: styleTags.trim(),
            custom_prompt_override: spec.custom_prompt_override?.trim() || "",
          },
          text_intent: textIntent.trim() || undefined,
          style_tags: styleTags.trim() || undefined,
        })
        .then((res) => {
          setPreview(res.preview_prompt);
          if (!editingRef.current) {
            setRawPrompt(res.preview_prompt);
          }
        })
        .catch(() => setPreview(""))
        .finally(() => setLoading(false));
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [spec, textIntent, styleTags, debounceMs]);

  useEffect(() => {
    if (spec.custom_prompt_override?.trim()) {
      setRawPrompt(spec.custom_prompt_override.trim());
    }
  }, [spec.custom_prompt_override]);

  const display = spec.custom_prompt_override?.trim() || (expanded && rawPrompt ? rawPrompt : preview);

  return (
    <View className="prompt-preview">
      <View className="prompt-preview__head">
        <View style={{ display: "flex", alignItems: "center", gap: "8rpx" }}>
          <Icon name="sparkle" size="sm" accent />
          <Text className="prompt-preview__label">{pv.label}</Text>
        </View>
        <Text className="prompt-preview__toggle" onClick={() => setExpanded((v) => !v)}>
          {expanded ? pv.collapse : pv.expand}
        </Text>
      </View>
      {!expanded && (
        <Text className={`prompt-preview__text ${loading ? "prompt-preview__text--loading" : ""}`}>
          {loading ? pv.loading : display || pv.empty}
        </Text>
      )}
      {expanded && (
        <View className="prompt-preview__raw">
          <Textarea
            className="prompt-preview__textarea"
            value={rawPrompt}
            maxlength={2000}
            onInput={(e) => {
              editingRef.current = true;
              const next = e.detail.value;
              setRawPrompt(next);
              onOverrideChange?.(next);
            }}
            onBlur={() => {
              editingRef.current = false;
            }}
          />
          <Text className="prompt-preview__label" style={{ marginTop: "8rpx", display: "block" }}>
            {pv.editHint}
          </Text>
        </View>
      )}
    </View>
  );
}
