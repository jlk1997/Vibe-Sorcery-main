import { View, Text } from "@tarojs/components";
import { Badge } from "./Badge";
import "./PostProcessBadges.scss";

type Props = {
  status?: Record<string, unknown>;
  c2paVerified?: boolean;
  onRetry?: () => void;
};

export function PostProcessBadges({ status, c2paVerified, onRetry }: Props) {
  const hls = status?.hls_done || status?.hls_url;
  const cover = status?.cover_done || status?.cover_url;
  const failed = status?.failed || status?.last_error;

  if (!status && !c2paVerified) return null;

  return (
    <View className="ui-pp-badges">
      {hls && <Badge tone="success">HLS</Badge>}
      {cover && <Badge tone="accent">Cover</Badge>}
      {c2paVerified && <Badge tone="success">C2PA</Badge>}
      {failed && (
        <Text className="ui-pp-badges__retry" onClick={onRetry}>
          Retry
        </Text>
      )}
    </View>
  );
}
