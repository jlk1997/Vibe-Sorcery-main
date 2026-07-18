import { PropsWithChildren, ReactNode } from "react";
import { View, Text } from "@tarojs/components";
import { clsx } from "../../utils/clsx";
import "./BottomSheet.scss";

type Props = PropsWithChildren<{
  open: boolean;
  title?: string;
  onClose: () => void;
  footer?: ReactNode;
}>;

export function BottomSheet({ open, title, onClose, footer, children }: Props) {
  if (!open) return null;

  return (
    <View className="ui-bottom-sheet">
      <View className="ui-bottom-sheet__backdrop" onClick={onClose} />
      <View
        className="ui-bottom-sheet__panel"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <View className="ui-bottom-sheet__handle" />
        {title && (
          <View className="ui-bottom-sheet__head">
            <Text className="ui-bottom-sheet__title">{title}</Text>
            <Text className="ui-bottom-sheet__close" onClick={onClose}>
              ✕
            </Text>
          </View>
        )}
        <View className={clsx("ui-bottom-sheet__body", footer && "ui-bottom-sheet__body--with-footer")}>{children}</View>
        {footer && <View className="ui-bottom-sheet__footer">{footer}</View>}
      </View>
    </View>
  );
}
