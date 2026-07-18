import Taro from "@tarojs/taro";

type ToastKind = "success" | "error" | "info" | "none";

export function showToast(title: string, kind: ToastKind = "none", duration = 2200) {
  const icon = kind === "success" ? "success" : kind === "error" ? "error" : "none";
  Taro.showToast({ title, icon, duration });
}

export function showSuccess(title: string) {
  showToast(title, "success");
}

export function showError(title: string) {
  showToast(title, "error", 2800);
}
