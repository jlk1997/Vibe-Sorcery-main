import { useCallback, useEffect, useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import "./EmotionPad.scss";

type AvValue = { arousal: number; valence: number };

type Props = {
  value: AvValue;
  onChange: (value: AvValue) => void;
  /** 四角文案：能量高/低、明暗亮/暗 */
  labels: { energyHigh: string; energyLow: string; moodBright: string; moodDark: string };
  /** 圆点上的动态表情，随心情变化 */
  dotEmoji?: string;
  /** 圆点颜色，随明暗变化（暖=明亮，冷=低沉） */
  dotColor?: string;
};

const MIN = 1;
const MAX = 9;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/** 二维情绪盘：横轴 Valence(明暗)、纵轴 Arousal(能量)，拖动单点即时更新。 */
export function EmotionPad({ value, onChange, labels, dotEmoji, dotColor }: Props) {
  const [active, setActive] = useState(false);

  const measure = useCallback(
    (cb: (rect: { left: number; top: number; width: number; height: number }) => void) => {
      if (process.env.TARO_ENV === "h5" && typeof document !== "undefined") {
        const el = document.querySelector(".emotion-pad__canvas");
        if (el) cb(el.getBoundingClientRect());
        return;
      }
      const query = Taro.createSelectorQuery();
      query
        .select(".emotion-pad__canvas")
        .boundingClientRect()
        .exec((res) => {
          if (res?.[0]) cb(res[0]);
        });
    },
    [],
  );

  const updateFromPoint = useCallback(
    (clientX: number, clientY: number) => {
      measure((rect) => {
        const w = rect.width || 300;
        const h = rect.height || 300;
        const vx = MIN + clamp((clientX - rect.left) / w, 0, 1) * (MAX - MIN);
        const ay = MIN + clamp(1 - (clientY - rect.top) / h, 0, 1) * (MAX - MIN);
        onChange({ arousal: round1(ay), valence: round1(vx) });
      });
    },
    [measure, onChange],
  );

  useEffect(() => {
    if (process.env.TARO_ENV !== "h5" || !active || typeof document === "undefined") return;
    function onMove(e: MouseEvent) {
      updateFromPoint(e.clientX, e.clientY);
    }
    function onUp() {
      setActive(false);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [active, updateFromPoint]);

  const left = `${((value.valence - MIN) / (MAX - MIN)) * 100}%`;
  const top = `${(1 - (value.arousal - MIN) / (MAX - MIN)) * 100}%`;

  return (
    <View className="emotion-pad">
      <View
        className="emotion-pad__canvas"
        onClick={(e) => {
          const t = (e as unknown as { detail?: { x?: number; y?: number } }).detail;
          if (t && typeof t.x === "number" && typeof t.y === "number") {
            updateFromPoint(t.x, t.y);
          }
        }}
      >
        <View className="emotion-pad__grid" />
        <View className="emotion-pad__axis emotion-pad__axis--v" />
        <View className="emotion-pad__axis emotion-pad__axis--h" />
        <Text className="emotion-pad__corner emotion-pad__corner--top">{labels.energyHigh}</Text>
        <Text className="emotion-pad__corner emotion-pad__corner--bottom">{labels.energyLow}</Text>
        <Text className="emotion-pad__corner emotion-pad__corner--left">{labels.moodDark}</Text>
        <Text className="emotion-pad__corner emotion-pad__corner--right">{labels.moodBright}</Text>
        <View
          className={`emotion-pad__dot ${active ? "emotion-pad__dot--active" : ""}`}
          style={{ left, top, ...(dotColor ? { background: dotColor } : {}) }}
          onTouchStart={() => setActive(true)}
          onTouchMove={(e) => {
            const touch = e.touches?.[0];
            if (touch) updateFromPoint(touch.clientX, touch.clientY);
          }}
          onTouchEnd={() => setActive(false)}
          onMouseDown={() => setActive(true)}
        >
          {dotEmoji ? <Text className="emotion-pad__dot-emoji">{dotEmoji}</Text> : null}
        </View>
      </View>
    </View>
  );
}
