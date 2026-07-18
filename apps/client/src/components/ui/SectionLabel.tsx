import { View, Text } from "@tarojs/components";
import "./SectionLabel.scss";

export function SectionLabel({ children }: { children: string }) {
  return <Text className="ui-section-label">{children}</Text>;
}
