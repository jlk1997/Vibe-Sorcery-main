import { View, Text } from "@tarojs/components";
import { useLocale } from "@vibe-sorcery/i18n";
import type { StudioAction } from "@vibe-sorcery/types";
import { Button, Icon } from "../../components/ui";
import "./CopilotActionPanel.scss";

type Props = {
  actions: StudioAction[];
  generating?: boolean;
  onPrimary: () => void;
  onSecondary?: () => void;
  primaryLabel: string;
  secondaryLabel?: string;
  variant?: "generate" | "studio";
};

export function CopilotActionPanel({
  actions,
  generating,
  onPrimary,
  onSecondary,
  primaryLabel,
  secondaryLabel,
  variant = "studio",
}: Props) {
  const { copy } = useLocale();
  const cp = copy.copilotUi;
  const start = actions.find((a) => a.type === "start_generation");
  const prefill = actions.find((a) => a.type === "prefill_create");
  const intent =
    prefill?.type === "prefill_create" ? prefill.payload.text_intent?.trim() : undefined;

  return (
    <View className="copilot-action-panel">
      <View className="copilot-action-panel__head">
        <View className="copilot-action-panel__icon">
          <Icon name={variant === "generate" ? "create" : "journey"} accent size="sm" />
        </View>
        <View className="copilot-action-panel__meta">
          <Text className="copilot-action-panel__title">
            {variant === "generate" ? cp.actionPanelGenerate : cp.actionPanelStudio}
          </Text>
          {intent ? <Text className="copilot-action-panel__intent">{intent}</Text> : null}
          {start?.type === "start_generation" && start.estimate?.cost != null ? (
            <Text className="copilot-action-panel__cost">
              {cp.actionPanelCost.replace("{n}", String(start.estimate.cost))}
            </Text>
          ) : null}
        </View>
      </View>
      <View className="copilot-action-panel__actions">
        <Button variant="primary" size="sm" loading={generating} onClick={onPrimary}>
          {primaryLabel}
        </Button>
        {onSecondary && secondaryLabel ? (
          <Button variant="ghost" size="sm" onClick={onSecondary}>
            {secondaryLabel}
          </Button>
        ) : null}
      </View>
    </View>
  );
}
