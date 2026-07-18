import { useEffect, useMemo, useState } from "react";
import { View, Text, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { vibeApi } from "../../services/api";
import { isLoggedIn, requireAuth } from "../../utils/auth";
import { canRemixWork } from "../../utils/remixLicense";
import { Button, Icon, TextArea } from "../ui";
import { WorkPicker } from "./WorkPicker";
import "./RemixFlowPanel.scss";

type Props = {
  sourceWorkId: string;
  intent: string;
  onSourceChange: (workId: string, title?: string) => void;
  onIntentChange: (value: string) => void;
  onRemixAllowedChange?: (allowed: boolean) => void;
  polishLabel?: string;
  polishingLabel?: string;
  polishing?: boolean;
  onPolish?: () => void;
};

type SourceMeta = {
  title: string;
  coverUrl?: string;
  remixAllowed: boolean;
};

export function RemixFlowPanel({
  sourceWorkId,
  intent,
  onSourceChange,
  onIntentChange,
  onRemixAllowedChange,
  polishLabel,
  polishingLabel,
  polishing = false,
  onPolish,
}: Props) {
  const { copy } = useLocale();
  const r = copy.createUi.remixFlow;
  const d = copy.derivative;
  const [meta, setMeta] = useState<SourceMeta | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [preview, setPreview] = useState<{ prompt?: string; bpm?: number; key?: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const steps = useMemo(
    () => [
      { id: "source", label: r.stepSource, done: !!sourceWorkId },
      { id: "intent", label: r.stepIntent, done: intent.trim().length >= 3 },
      { id: "go", label: r.stepGo, done: false },
    ],
    [r.stepSource, r.stepIntent, r.stepGo, sourceWorkId, intent]
  );

  const activeStep = !sourceWorkId ? 0 : intent.trim().length < 3 ? 1 : 2;

  useEffect(() => {
    setPreview(null);
    if (!sourceWorkId) {
      setMeta(null);
      onRemixAllowedChange?.(true);
      return;
    }
    if (!isLoggedIn()) return;
    let cancelled = false;
    setLoadingMeta(true);
    vibeApi
      .getWork(sourceWorkId)
      .then((work) => {
        if (cancelled) return;
        setMeta({
          title: work.title,
          coverUrl: work.cover_url,
          remixAllowed: canRemixWork(work),
        });
        onRemixAllowedChange?.(canRemixWork(work));
      })
      .catch(() => {
        if (!cancelled) {
          setMeta(null);
          onRemixAllowedChange?.(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMeta(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceWorkId]);

  async function runPreview() {
    if (!sourceWorkId || !intent.trim() || !meta?.remixAllowed) return;
    if (!requireAuth()) return;
    setPreviewLoading(true);
    try {
      setPreview(await vibeApi.previewRemix(sourceWorkId, intent.trim()));
      Taro.showToast({ title: r.previewDone, icon: "success" });
    } catch {
      Taro.showToast({ title: d.previewFail, icon: "none" });
    } finally {
      setPreviewLoading(false);
    }
  }

  function openProvenance() {
    if (!sourceWorkId) return;
    Taro.navigateTo({ url: `/pages/provenance/index?workId=${sourceWorkId}` });
  }

  return (
    <View className="remix-flow">
      <View className="remix-flow__head">
        <View className="remix-flow__sigil">
          <Icon name="remix" size="sm" accent />
        </View>
        <View className="remix-flow__head-text">
          <Text className="remix-flow__title">{r.title}</Text>
          <Text className="remix-flow__subtitle">{d.remix.description}</Text>
        </View>
      </View>

      <View className="remix-flow__steps">
        {steps.map((step, index) => (
          <View key={step.id} className="remix-flow__step-wrap">
            {index > 0 && <View className={`remix-flow__step-line ${index <= activeStep ? "remix-flow__step-line--active" : ""}`} />}
            <View className={`remix-flow__step ${index <= activeStep ? "remix-flow__step--active" : ""} ${step.done ? "remix-flow__step--done" : ""}`}>
              <Text className="remix-flow__step-num">{index + 1}</Text>
              <Text className="remix-flow__step-label">{step.label}</Text>
            </View>
          </View>
        ))}
      </View>

      <View className="remix-flow__section">
        <Text className="remix-flow__section-label">{r.sourceLabel}</Text>
        {!sourceWorkId ? (
          <>
            <Text className="remix-flow__empty">{loadingMeta ? r.loadingSource : r.emptySource}</Text>
            <WorkPicker value={sourceWorkId} onChange={onSourceChange} label={r.pickSource} />
          </>
        ) : (
          <>
            {meta ? (
              <View className="remix-flow__source-card">
                <View className="remix-flow__source-main">
                  {meta.coverUrl ? (
                    <Image className="remix-flow__cover" src={meta.coverUrl} mode="aspectFill" />
                  ) : (
                    <View className="remix-flow__cover remix-flow__cover--placeholder">
                      <Icon name="music" size="sm" accent />
                    </View>
                  )}
                  <View className="remix-flow__source-info">
                    <Text className="remix-flow__source-title">{meta.title}</Text>
                    <Text className="remix-flow__source-hint">{d.remix.when}</Text>
                  </View>
                </View>
                <View className="remix-flow__source-actions">
                  <View className="remix-flow__link" onClick={openProvenance}>
                    <Icon name="search" size="sm" />
                    <Text>{r.viewProvenance}</Text>
                  </View>
                </View>
                {!meta.remixAllowed && (
                  <View className="remix-flow__blocked">
                    <Icon name="flag" size="sm" />
                    <Text>{d.remixNotAllowed}</Text>
                  </View>
                )}
              </View>
            ) : (
              <Text className="remix-flow__empty">{loadingMeta ? r.loadingSource : r.emptySource}</Text>
            )}
            <WorkPicker value={sourceWorkId} onChange={onSourceChange} label={r.changeSource} />
          </>
        )}
      </View>

      <View className={`remix-flow__section ${!sourceWorkId ? "remix-flow__section--disabled" : ""}`}>
        <View className="remix-flow__intent-head">
          <Text className="remix-flow__section-label">{d.intentLabel}</Text>
          {onPolish && polishLabel && (
            <View
              className={`remix-flow__polish ${polishing ? "remix-flow__polish--loading" : ""}`}
              onClick={polishing ? undefined : onPolish}
            >
              <Icon name="sparkle" size="sm" accent />
              <Text className="remix-flow__polish-text">{polishing ? polishingLabel : polishLabel}</Text>
            </View>
          )}
        </View>
        <Text className="remix-flow__section-hint">{r.intentHint}</Text>
        <View className="remix-flow__examples">
          {r.examples.map((example) => (
            <View key={example} className="remix-flow__example" onClick={() => onIntentChange(example)}>
              <Text className="remix-flow__example-text">{example}</Text>
            </View>
          ))}
        </View>
        <TextArea
          placeholder={d.intentPlaceholder}
          value={intent}
          maxlength={300}
          disabled={!sourceWorkId || meta?.remixAllowed === false}
          onInput={(e) => {
            onIntentChange(e.detail.value);
            setPreview(null);
          }}
        />
        {preview && (
          <View className="remix-flow__preview">
            <Text className="remix-flow__preview-label">{r.previewLabel}</Text>
            <Text className="remix-flow__preview-prompt">{preview.prompt}</Text>
            {preview.bpm != null && (
              <Text className="remix-flow__preview-meta">
                BPM {preview.bpm}
                {preview.key ? ` · ${preview.key}` : ""}
              </Text>
            )}
          </View>
        )}
        <Button
          variant="secondary"
          size="sm"
          block
          loading={previewLoading}
          disabled={!sourceWorkId || !intent.trim() || meta?.remixAllowed === false}
          onClick={runPreview}
        >
          {copy.createUi.remixPreview}
        </Button>
      </View>
    </View>
  );
}
