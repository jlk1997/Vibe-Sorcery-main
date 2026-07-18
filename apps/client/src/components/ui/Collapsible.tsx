import { PropsWithChildren, useEffect, useState } from "react";
import { View, Text } from "@tarojs/components";
import { getItem, setItem } from "../../platform/storage";
import "./ui.scss";

type Props = PropsWithChildren<{
  label: string;
  storageKey?: string;
  defaultOpen?: boolean;
}>;

export function Collapsible({ label, storageKey, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!storageKey) return;
    const saved = getItem(`collapse:${storageKey}`);
    if (saved === "1") setOpen(true);
    if (saved === "0") setOpen(false);
  }, [storageKey]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (storageKey) setItem(`collapse:${storageKey}`, next ? "1" : "0");
  }

  return (
    <View className="ui-collapsible">
      <View className="ui-collapsible__head" onClick={toggle}>
        <Text className="ui-collapsible__label">{label}</Text>
        <Text className="ui-collapsible__chevron">{open ? "▲" : "▼"}</Text>
      </View>
      {open && <View className="ui-collapsible__body">{children}</View>}
    </View>
  );
}
