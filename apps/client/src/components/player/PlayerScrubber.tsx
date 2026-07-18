import { useCallback, useEffect, useId, useRef, useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { ProgressRail } from "../ui/ProgressRail";
import { clsx } from "../../utils/clsx";
import "./PlayerScrubber.scss";

type Props = {
  current: number;
  duration: number;
  seeking: number;
  onSeeking: (time: number) => void;
  onSeek: (time: number) => void;
  formatTime: (sec: number) => string;
};

function clientXFromEvent(e: { clientX?: number; touches?: Array<{ clientX: number }>; changedTouches?: Array<{ clientX: number }> }) {
  if (e.touches?.length) return e.touches[0].clientX;
  if (e.changedTouches?.length) return e.changedTouches[0].clientX;
  return e.clientX ?? 0;
}

/** 网易云风格：左右时间 + 可拖拽进度条（加大触摸热区） */
export function PlayerScrubber({ current, duration, seeking, onSeeking, onSeek, formatTime }: Props) {
  const trackId = useId().replace(/:/g, "");
  const trackRef = useRef<HTMLElement | null>(null);
  const rectRef = useRef<{ left: number; width: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const pct = duration ? (seeking / duration) * 100 : 0;

  const timeFromClientX = useCallback(
    (clientX: number) => {
      const rect = rectRef.current;
      if (!rect?.width || !duration) return seeking;
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration, seeking],
  );

  const measureTrack = useCallback(() => {
    return new Promise<{ left: number; width: number } | null>((resolve) => {
      Taro.createSelectorQuery()
        .select(`#${trackId}`)
        .boundingClientRect((rect) => {
          if (rect && !Array.isArray(rect) && rect.width > 0) {
            resolve({ left: rect.left, width: rect.width });
          } else {
            resolve(null);
          }
        })
        .exec();
    });
  }, [trackId]);

  const cacheTrackRect = useCallback(async () => {
    if (process.env.TARO_ENV === "h5" && trackRef.current) {
      const rect = trackRef.current.getBoundingClientRect();
      if (rect.width > 0) {
        rectRef.current = { left: rect.left, width: rect.width };
        return rectRef.current;
      }
    }
    return measureTrack();
  }, [measureTrack]);

  const beginDrag = useCallback(
    async (clientX: number) => {
      rectRef.current = await cacheTrackRect();
      if (!rectRef.current || !duration) return;
      setDragging(true);
      onSeeking(timeFromClientX(clientX));
    },
    [cacheTrackRect, duration, onSeeking, timeFromClientX],
  );

  const moveDrag = useCallback(
    (clientX: number) => {
      if (!rectRef.current || !duration) return;
      onSeeking(timeFromClientX(clientX));
    },
    [duration, onSeeking, timeFromClientX],
  );

  const endDrag = useCallback(
    (clientX: number) => {
      if (!rectRef.current || !duration) {
        setDragging(false);
        rectRef.current = null;
        return;
      }
      const time = timeFromClientX(clientX);
      onSeeking(time);
      onSeek(time);
      setDragging(false);
      rectRef.current = null;
    },
    [duration, onSeek, onSeeking, timeFromClientX],
  );

  useEffect(() => {
    if (!dragging || process.env.TARO_ENV !== "h5") return;
    const onMove = (e: MouseEvent) => moveDrag(e.clientX);
    const onUp = (e: MouseEvent) => endDrag(e.clientX);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [dragging, endDrag, moveDrag]);

  return (
    <View className={clsx("player-scrubber", dragging && "player-scrubber--dragging")}>
      <Text className="player-scrubber__time">{formatTime(dragging ? seeking : current)}</Text>
      <View
        id={trackId}
        ref={trackRef}
        className="player-scrubber__track-wrap"
        catchMove
        onTouchStart={(e) => {
          e.stopPropagation();
          void beginDrag(clientXFromEvent(e));
        }}
        onTouchMove={(e) => {
          e.stopPropagation();
          moveDrag(clientXFromEvent(e));
        }}
        onTouchEnd={(e) => {
          e.stopPropagation();
          endDrag(clientXFromEvent(e));
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          void beginDrag(e.clientX);
        }}
      >
        <ProgressRail pct={pct} className="player-scrubber__rail" />
      </View>
      <Text className="player-scrubber__time">{formatTime(duration)}</Text>
    </View>
  );
}
