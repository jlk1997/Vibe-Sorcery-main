import { View, Text, Button } from "@tarojs/components";
import { Icon, type IconName } from "./Icon";
import { clsx } from "../../utils/clsx";
import "./ActionIconBar.scss";

export type ActionIconItem = {
  id: string;
  icon: IconName;
  label?: string;
  count?: number;
  active?: boolean;
  accent?: boolean;
  primary?: boolean;
  onClick?: () => void;
  /** weapp: render as native <Button open-type="share"> so it can trigger 转发. */
  openType?: "share";
  /** weapp: data-* attributes read by the page's useShareAppMessage(res.target.dataset). */
  dataset?: Record<string, string>;
};

type Props = {
  items: ActionIconItem[];
  className?: string;
};

const isWeapp = process.env.TARO_ENV === "weapp";

/** Feed 卡片底部横向 icon 操作栏 */
export function ActionIconBar({ items, className }: Props) {
  return (
    <View className={clsx("ui-action-bar", className)}>
      {items.map((item) => {
        const inner = (
          <>
            <Icon
              name={item.icon}
              size={item.primary ? "md" : "sm"}
              tone={item.primary ? "dark" : "light"}
              accent={!item.primary && (item.accent || item.active)}
            />
            {item.count != null && item.count > 0 && <Text className="ui-action-bar__count">{item.count}</Text>}
          </>
        );

        const itemClass = clsx(
          "ui-action-bar__item",
          item.primary && "ui-action-bar__item--primary",
          item.active && "ui-action-bar__item--active"
        );

        if (isWeapp && item.openType === "share") {
          const dataProps: Record<string, string> = {};
          if (item.dataset) {
            for (const [k, v] of Object.entries(item.dataset)) dataProps[`data-${k}`] = v;
          }
          return (
            <Button
              key={item.id}
              className={clsx("ui-action-bar__item", "ui-action-bar__item--share", itemClass)}
              openType="share"
              onClick={(e) => e.stopPropagation()}
              {...dataProps}
            >
              {inner}
            </Button>
          );
        }

        return (
          <View
            key={item.id}
            className={itemClass}
            onClick={(e) => {
              e.stopPropagation();
              item.onClick?.();
            }}
          >
            {inner}
          </View>
        );
      })}
    </View>
  );
}
