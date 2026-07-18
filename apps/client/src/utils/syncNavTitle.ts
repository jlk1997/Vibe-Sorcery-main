import Taro from "@tarojs/taro";

export function syncNavTitle(title: string) {
  if (!title) return;
  Taro.setNavigationBarTitle({ title }).catch(() => {});
  if (typeof document !== "undefined") {
    document.title = title;
  }
}
