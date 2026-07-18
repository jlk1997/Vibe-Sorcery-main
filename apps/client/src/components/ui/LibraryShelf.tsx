import { View, Text, Image, ScrollView } from "@tarojs/components";
import { clsx } from "../../utils/clsx";
import "./LibraryShelf.scss";

export type ShelfItem = {
  id: string;
  title: string;
  coverUrl?: string;
};

type Props = {
  label: string;
  items: ShelfItem[];
  onSelect?: (id: string) => void;
  className?: string;
};

export function LibraryShelf({ label, items, onSelect, className }: Props) {
  if (items.length === 0) return null;

  return (
    <View className={clsx("ui-library-shelf", className)}>
      {label ? <Text className="ui-library-shelf__label">{label}</Text> : null}
      <ScrollView scrollX className="ui-library-shelf__scroll" showScrollbar={false}>
        <View className="ui-library-shelf__row">
          {items.map((item) => (
            <View key={item.id} className="ui-library-shelf__item" onClick={() => onSelect?.(item.id)}>
              {item.coverUrl ? (
                <Image className="ui-library-shelf__cover" src={item.coverUrl} mode="aspectFill" />
              ) : (
                <View className="ui-library-shelf__cover ui-library-shelf__cover--fallback" />
              )}
              <Text className="ui-library-shelf__title">{item.title}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
