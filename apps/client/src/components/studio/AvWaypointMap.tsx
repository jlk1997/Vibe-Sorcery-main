import { useCallback, useEffect, useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { Waypoint } from "@vibe-sorcery/types";
import "./AvWaypointMap.scss";

const SIZE = 10;

type Props = {
  waypoints: Waypoint[];
  onChange: (waypoints: Waypoint[]) => void;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function AvWaypointMap({ waypoints, onChange }: Props) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const measure = useCallback((cb: (rect: { left: number; top: number; width: number; height: number }) => void) => {
    if (process.env.TARO_ENV === "h5" && typeof document !== "undefined") {
      const el = document.querySelector(".av-map__canvas");
      if (el) cb(el.getBoundingClientRect());
      return;
    }
    const query = Taro.createSelectorQuery();
    query.select(".av-map__canvas").boundingClientRect().exec((res) => {
      if (res?.[0]) cb(res[0]);
    });
  }, []);

  function updateFromPoint(clientX: number, clientY: number, idx: number) {
    measure((rect) => {
      const w = rect.width || 300;
      const h = rect.height || 300;
      const x = clamp(((clientX - rect.left) / w) * SIZE, 0, SIZE);
      const y = clamp((1 - (clientY - rect.top) / h) * SIZE, 0, SIZE);
      const next = waypoints.map((wp, i) =>
        i === idx ? { ...wp, valence: Math.round(x * 10) / 10, arousal: Math.round(y * 10) / 10 } : wp
      );
      onChange(next);
    });
  }

  function onTouchMove(e: { touches: Array<{ clientX: number; clientY: number }> }, idx: number) {
    const t = e.touches[0];
    if (!t) return;
    updateFromPoint(t.clientX, t.clientY, idx);
  }

  useEffect(() => {
    if (process.env.TARO_ENV !== "h5" || activeIdx == null || typeof document === "undefined") return;
    const idx = activeIdx;
    function onMove(e: MouseEvent) {
      updateFromPoint(e.clientX, e.clientY, idx);
    }
    function onUp() {
      setActiveIdx(null);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [activeIdx, updateFromPoint]);

  return (
    <View className="av-map">
      <Text className="av-map__hint">拖动圆点编辑情绪平面（横轴 Valence · 纵轴 Arousal）</Text>
      <View className="av-map__canvas">
        <View className="av-map__grid" />
        {waypoints.map((wp, i) => {
          const left = `${(wp.valence / SIZE) * 100}%`;
          const top = `${(1 - wp.arousal / SIZE) * 100}%`;
          return (
            <View
              key={i}
              className={`av-map__dot ${activeIdx === i ? "av-map__dot--active" : ""}`}
              style={{ left, top }}
              onTouchStart={() => setActiveIdx(i)}
              onTouchMove={(e) => onTouchMove(e, i)}
              onTouchEnd={() => setActiveIdx(null)}
              onMouseDown={() => setActiveIdx(i)}
            >
              <Text className="av-map__dot-label">{i + 1}</Text>
            </View>
          );
        })}
      </View>
      {waypoints.map((wp, i) => (
        <Text key={`meta-${i}`} className="av-map__meta">
          航点 {i + 1}: A{wp.arousal.toFixed(1)} V{wp.valence.toFixed(1)} {wp.description || ""}
        </Text>
      ))}
    </View>
  );
}
