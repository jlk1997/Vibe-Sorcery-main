import { View, Text } from "@tarojs/components";
import { Icon, type IconName } from "./Icon";
import { clsx } from "../../utils/clsx";
import "./ProvenanceTimeline.scss";

type Step = {
  kind?: string;
  type?: string;
  model?: unknown;
  created_at?: unknown;
};

type Props = {
  steps: Step[];
  stepLabel: string;
  modelLabel: string;
};

function stepIcon(kind: string): IconName {
  const k = kind.toLowerCase();
  if (k.includes("remix")) return "remix";
  if (k.includes("cover")) return "music";
  if (k.includes("generat")) return "create";
  if (k.includes("embed") || k.includes("ingest")) return "feed";
  return "music";
}

export function ProvenanceTimeline({ steps, stepLabel, modelLabel }: Props) {
  return (
    <View className="prov-timeline">
      {steps.map((step, i) => {
        const kind = String(step.kind || step.type || `${stepLabel} ${i + 1}`);
        const isLast = i === steps.length - 1;
        return (
          <View key={i} className="prov-timeline__item">
            <View className="prov-timeline__rail">
              <View className={clsx("prov-timeline__node", i === 0 && "prov-timeline__node--start", isLast && "prov-timeline__node--end")}>
                <Icon name={stepIcon(kind)} size="sm" accent />
              </View>
              {!isLast && <View className="prov-timeline__line" />}
            </View>
            <View className="prov-timeline__card">
              <Text className="prov-timeline__kind">{kind}</Text>
              {step.model != null && (
                <Text className="prov-timeline__meta">
                  {modelLabel}
                  {String(step.model)}
                </Text>
              )}
              {step.created_at != null && (
                <Text className="prov-timeline__meta">{String(step.created_at).slice(0, 16).replace("T", " ")}</Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}
