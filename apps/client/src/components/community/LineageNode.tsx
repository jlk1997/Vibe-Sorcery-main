import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { Icon } from "../ui";
import { clsx } from "../../utils/clsx";
import "./LineageNode.scss";

type Node = {
  id: string;
  title: string;
  author?: string;
  children?: Node[];
};

type Props = {
  node: Node;
  depth?: number;
  currentId?: string;
};

export function LineageNode({ node, depth = 0, currentId }: Props) {
  const children = node.children || [];
  const isCurrent = node.id === currentId;

  return (
    <View className={clsx("lineage-node", depth > 0 && "lineage-node--child")} style={{ marginLeft: depth > 0 ? `${Math.min(depth * 24, 96)}rpx` : undefined }}>
      {depth > 0 && <View className="lineage-node__connector" />}
      <View
        className={clsx("lineage-node__card", isCurrent && "lineage-node__card--current")}
        onClick={() => Taro.navigateTo({ url: `/pages/provenance/index?workId=${node.id}` })}
      >
        <View className="lineage-node__icon">
          <Icon name={depth === 0 ? "music" : "remix"} accent size="sm" />
        </View>
        <View className="lineage-node__info">
          <Text className="lineage-node__title">{node.title}</Text>
          {node.author && <Text className="lineage-node__author">@{node.author}</Text>}
        </View>
        {children.length > 0 && (
          <View className="lineage-node__branch">
            <Text>{children.length}</Text>
          </View>
        )}
      </View>
      {children.map((child) => (
        <LineageNode key={child.id} node={child} depth={depth + 1} currentId={currentId} />
      ))}
    </View>
  );
}
