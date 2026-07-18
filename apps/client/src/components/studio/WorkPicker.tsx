import { useEffect, useState } from "react";
import { View, Text } from "@tarojs/components";
import { useLocale } from "@vibe-sorcery/i18n";
import { vibeApi } from "../../services/api";
import { isLoggedIn, requireAuth } from "../../utils/auth";
import { Button } from "../ui";
import "./WorkPicker.scss";

type Work = { id: string; title: string };

type Props = {
  value: string;
  onChange: (workId: string, title?: string) => void;
  label?: string;
};

export function WorkPicker({ value, onChange, label }: Props) {
  const { copy } = useLocale();
  const w = copy.workPickerUi;
  const [open, setOpen] = useState(false);
  const [works, setWorks] = useState<Work[]>([]);
  const [selectedTitle, setSelectedTitle] = useState("");

  useEffect(() => {
    if (!value) {
      setSelectedTitle("");
      return;
    }
    const item = works.find((x) => x.id === value);
    if (item) {
      setSelectedTitle(item.title);
      return;
    }
    if (!isLoggedIn()) return;
    let cancelled = false;
    vibeApi
      .getWork(value)
      .then((work) => {
        if (!cancelled) setSelectedTitle(work.title);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [value, works]);

  async function openPicker() {
    if (!requireAuth()) return;
    try {
      const list = await vibeApi.listWorks();
      setWorks(list.map((item) => ({ id: item.id, title: item.title })));
      setOpen(true);
    } catch {
      setWorks([]);
      setOpen(true);
    }
  }

  function pick(item: Work) {
    onChange(item.id, item.title);
    setSelectedTitle(item.title);
    setOpen(false);
  }

  return (
    <View className="work-picker">
      <Text className="micro-label">{label ?? w.label}</Text>
      <View className="work-picker__selected">
        <View className="work-picker__selected-text">
          <Text className="work-picker__title">{value ? selectedTitle || "…" : w.selectTitle}</Text>
          {value && selectedTitle ? <Text className="work-picker__id">{value.slice(0, 8)}</Text> : null}
        </View>
        <Button size="sm" variant="secondary" onClick={openPicker}>
          {w.pick}
        </Button>
      </View>
      {open && (
        <View className="work-picker__modal" onClick={() => setOpen(false)}>
          <View className="work-picker__sheet" onClick={(e) => e.stopPropagation()}>
            <Text className="typo-h2">{w.sheetTitle}</Text>
            {!isLoggedIn() && <Text className="typo-meta">{w.loginRequired}</Text>}
            {works.length === 0 && <Text className="typo-meta">{w.empty}</Text>}
            {works.map((item) => (
              <View key={item.id} className="work-picker__row" onClick={() => pick(item)}>
                <Text className="work-picker__title">{item.title}</Text>
                <Text className="typo-meta">{item.id.slice(0, 8)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}
