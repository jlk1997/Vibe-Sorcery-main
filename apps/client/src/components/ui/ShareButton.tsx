import type { ReactNode } from "react";
import { Button, View } from "@tarojs/components";
import { clsx } from "../../utils/clsx";
import "./ui.scss";

const isWeapp = process.env.TARO_ENV === "weapp";

type Props = {
  className?: string;
  children: ReactNode;
  /** H5 fallback handler (weapp uses native open-type=share). */
  onShare?: () => void;
  /** weapp: attaches data-* so a list page's useShareAppMessage can read res.target.dataset. */
  dataset?: Record<string, string>;
};

/**
 * Cross-platform share trigger.
 * - weapp: renders a native <Button open-type="share"> (the only way to trigger the
 *   "发送给朋友" sheet); the page must also declare useShareAppMessage + enableShareAppMessage.
 * - H5: renders a plain tappable View calling onShare (navigator.share / clipboard).
 */
export function ShareButton({ className, children, onShare, dataset }: Props) {
  if (isWeapp) {
    const dataProps: Record<string, string> = {};
    if (dataset) {
      for (const [k, v] of Object.entries(dataset)) dataProps[`data-${k}`] = v;
    }
    return (
      <Button className={clsx("ui-share-btn", className)} openType="share" {...dataProps}>
        {children}
      </Button>
    );
  }
  return (
    <View className={clsx("ui-share-btn", className)} onClick={onShare}>
      {children}
    </View>
  );
}
