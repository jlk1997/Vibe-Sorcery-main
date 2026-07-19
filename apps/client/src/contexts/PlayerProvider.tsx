import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Taro from "@tarojs/taro";
import { getCopy, type Locale, defaultLocale } from "@vibe-sorcery/i18n";
import type { PlayerTrack } from "@vibe-sorcery/types";
import { ListenCheckinSheet } from "../components/engagement/ListenCheckinSheet";
import { createAudioEngine, type AudioEngine } from "../platform/audio";
import { playbackUrls } from "../platform/media";
import { getItem, setItem } from "../platform/storage";
import { vibeApi } from "../services/api";
import { STACK_PAGE_ROUTES } from "../constants/routes";

function getStoredLocale(): Locale {
  const stored = getItem("vibe-locale");
  return stored === "en" || stored === "zh" ? stored : defaultLocale;
}

function queueEndToast() {
  Taro.showToast({ title: getCopy(getStoredLocale()).player.queueEnd, icon: "none", duration: 2000 });
}

type PlayTrackOptions = {
  queue?: PlayerTrack[];
  startIndex?: number;
  navigate?: boolean;
};

type PlayerTransportValue = {
  currentTrack: PlayerTrack | null;
  currentTrackId: string | null;
  queue: PlayerTrack[];
  queueIndex: number;
  isPlaying: boolean;
  playTrack: (track: PlayerTrack, options?: PlayTrackOptions) => void;
  togglePlay: () => void;
  playNext: () => void;
  playPrevious: () => void;
  stop: () => void;
  hasNext: boolean;
  hasPrevious: boolean;
  patchTrackTitle: (workId: string, title: string) => void;
};

type PlayerProgressValue = {
  currentTime: number;
  duration: number;
  seek: (time: number) => void;
};

type PlayerContextValue = PlayerTransportValue & PlayerProgressValue;

const STORAGE_KEY = "vibe-player-v1";

const PlayerTransportContext = createContext<PlayerTransportValue | null>(null);
const PlayerProgressContext = createContext<PlayerProgressValue | null>(null);

function readPersisted() {
  try {
    const raw = getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { currentTrack: PlayerTrack; queue: PlayerTrack[]; queueIndex: number };
  } catch {
    return null;
  }
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const persisted = useRef(readPersisted());
  const engineRef = useRef<AudioEngine | null>(null);
  const playNextRef = useRef<() => void>(() => {});
  const [currentTrack, setCurrentTrack] = useState<PlayerTrack | null>(() => persisted.current?.currentTrack ?? null);
  const [queue, setQueue] = useState<PlayerTrack[]>(() => persisted.current?.queue ?? []);
  const [queueIndex, setQueueIndex] = useState(() => persisted.current?.queueIndex ?? 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [checkinTrack, setCheckinTrack] = useState<{ workId: string; title: string; ratio: number } | null>(null);
  const checkinShownRef = useRef<Set<string>>(new Set());

  const queueRef = useRef(queue);
  const queueIndexRef = useRef(queueIndex);
  const currentTimeRef = useRef(currentTime);
  queueRef.current = queue;
  queueIndexRef.current = queueIndex;
  currentTimeRef.current = currentTime;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  // 记录「已发起播放」与「已预缓冲」的曲目，避免预缓冲与真正播放互相打架、重复加载。
  const startedIdRef = useRef<string | null>(null);
  const preparedIdRef = useRef<string | null>(null);

  const ensureEngine = useCallback(() => {
    if (!engineRef.current) {
      engineRef.current = createAudioEngine({
        onTimeUpdate: setCurrentTime,
        onDurationChange: setDuration,
        onPlayingChange: setIsPlaying,
        onEnded: () => playNextRef.current(),
      });
    }
    return engineRef.current;
  }, []);

  const playAtIndex = useCallback(
    (tracks: PlayerTrack[], index: number, navigate = true) => {
      const track = tracks[index];
      if (!track) return;
      const engine = ensureEngine();
      setQueue(tracks);
      setQueueIndex(index);
      setCurrentTrack(track);
      setCurrentTime(0);
      setDuration(0);
      const { primary, fallback } = playbackUrls(track);
      startedIdRef.current = track.id;
      void engine.play(primary, fallback).catch(() => {
        Taro.showToast({ title: getCopy(getStoredLocale()).player.playError, icon: "none" });
        setIsPlaying(false);
      });
      const communitySources = new Set(["feed", "user", "search", "library", "challenge", "charts", "duel", "works"]);
      if (track.id && track.source && communitySources.has(track.source)) {
        vibeApi.trackEvent("community_listen", { work_id: track.id, source: track.source }).catch(() => {});
      }
      if (navigate) Taro.navigateTo({ url: STACK_PAGE_ROUTES.nowPlaying });
    },
    [ensureEngine]
  );

  const playNext = useCallback(() => {
    const tracks = queueRef.current;
    const idx = queueIndexRef.current;
    if (idx < tracks.length - 1) playAtIndex(tracks, idx + 1, false);
    else {
      setIsPlaying(false);
      if (tracks.length > 0) queueEndToast();
    }
  }, [playAtIndex]);

  const playPrevious = useCallback(() => {
    const tracks = queueRef.current;
    const idx = queueIndexRef.current;
    if (currentTimeRef.current > 3) {
      ensureEngine().seek(0);
      setCurrentTime(0);
      return;
    }
    if (idx > 0) playAtIndex(tracks, idx - 1, false);
  }, [playAtIndex, ensureEngine]);

  useEffect(() => {
    playNextRef.current = playNext;
  }, [playNext]);

  useEffect(() => {
    return () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  // 预缓冲：当前曲目已就绪但还没开始播放时，提前把音频源加载好。
  // 首次点击播放卡 2~3 秒的根因是「点击后才开始下载/解码」；提前 prepare
  // 后，用户真正点播放时通常已缓冲完成，可走快速 resume，几乎无等待。
  useEffect(() => {
    const track = currentTrack;
    if (!track) return;
    if (isPlayingRef.current) return; // 正在播放/即将自动播放，无需预缓冲
    if (startedIdRef.current === track.id) return; // 已发起播放
    if (preparedIdRef.current === track.id) return; // 已预缓冲过
    preparedIdRef.current = track.id;
    const engine = ensureEngine();
    const { primary, fallback } = playbackUrls(track);
    void engine.prepare(primary, fallback).catch(() => {});
  }, [currentTrack?.id, ensureEngine]);

  useEffect(() => {
    if (!currentTrack?.id || !duration || duration <= 0) return;
    const ratio = currentTime / duration;
    const communitySources = new Set(["feed", "user", "search", "library", "challenge", "charts", "duel", "works"]);
    if (
      ratio >= 0.8 &&
      currentTrack.source &&
      communitySources.has(currentTrack.source) &&
      !checkinShownRef.current.has(currentTrack.id)
    ) {
      checkinShownRef.current.add(currentTrack.id);
      setCheckinTrack({ workId: currentTrack.id, title: currentTrack.title, ratio });
    }
  }, [currentTime, duration, currentTrack?.id, currentTrack?.title, currentTrack?.source]);

  const playTrack = useCallback(
    (track: PlayerTrack, options?: PlayTrackOptions) => {
      const tracks = options?.queue?.length ? options.queue : [track];
      let index = options?.startIndex ?? tracks.findIndex((t) => t.id === track.id);
      if (index < 0) index = 0;
      playAtIndex(tracks, index, options?.navigate !== false);
    },
    [playAtIndex]
  );

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      engineRef.current?.pause();
      return;
    }
    if (!currentTrack) return;

    const engine = ensureEngine();
    const playCurrent = () => {
      const { primary, fallback } = playbackUrls(currentTrack);
      startedIdRef.current = currentTrack.id;
      void engine.play(primary, fallback).catch(() => {
        Taro.showToast({ title: getCopy(getStoredLocale()).player.playError, icon: "none" });
        setIsPlaying(false);
      });
    };

    // Only resume when the engine actually loaded audio (duration > 0).
    // A failed HLS/src load still leaves src set — resume would silently no-op.
    if (engine.isReady() && duration > 0) {
      void engine.resume().catch(() => playCurrent());
      return;
    }
    playCurrent();
  }, [isPlaying, currentTrack, duration, ensureEngine]);

  const seek = useCallback(
    (time: number) => {
      ensureEngine().seek(time);
      setCurrentTime(time);
    },
    [ensureEngine]
  );

  const stop = useCallback(() => {
    engineRef.current?.pause();
    setCurrentTrack(null);
    setQueue([]);
    setQueueIndex(0);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setItem(STORAGE_KEY, "");
  }, []);

  const patchTrackTitle = useCallback((workId: string, title: string) => {
    setCurrentTrack((prev) => (prev?.id === workId ? { ...prev, title } : prev));
    setQueue((prev) => prev.map((t) => (t.id === workId ? { ...t, title } : t)));
  }, []);

  useEffect(() => {
    if (!currentTrack) {
      setItem(STORAGE_KEY, "");
      return;
    }
    setItem(STORAGE_KEY, JSON.stringify({ currentTrack, queue, queueIndex }));
  }, [currentTrack, queue, queueIndex]);

  const hasNext = queueIndex < queue.length - 1;
  const hasPrevious = queueIndex > 0 || currentTime > 3;
  const currentTrackId = currentTrack?.id ?? null;

  const transportValue = useMemo<PlayerTransportValue>(
    () => ({
      currentTrack,
      currentTrackId,
      queue,
      queueIndex,
      isPlaying,
      playTrack,
      togglePlay,
      playNext,
      playPrevious,
      stop,
      hasNext,
      hasPrevious,
      patchTrackTitle,
    }),
    [currentTrack, currentTrackId, queue, queueIndex, isPlaying, playTrack, togglePlay, playNext, playPrevious, stop, hasNext, hasPrevious, patchTrackTitle]
  );

  const progressValue = useMemo<PlayerProgressValue>(
    () => ({ currentTime, duration, seek }),
    [currentTime, duration, seek]
  );

  return (
    <PlayerTransportContext.Provider value={transportValue}>
      <PlayerProgressContext.Provider value={progressValue}>
        {children}
        {checkinTrack && (
          <ListenCheckinSheet
            workId={checkinTrack.workId}
            workTitle={checkinTrack.title}
            listenRatio={checkinTrack.ratio}
            onDone={() => setCheckinTrack(null)}
            onDismiss={() => setCheckinTrack(null)}
          />
        )}
      </PlayerProgressContext.Provider>
    </PlayerTransportContext.Provider>
  );
}

/** Subscribe only to transport state — avoids re-renders on playback tick. */
export function usePlayerTransport() {
  const ctx = useContext(PlayerTransportContext);
  if (!ctx) throw new Error("usePlayerTransport must be used within PlayerProvider");
  return ctx;
}

export function usePlayerProgress() {
  const ctx = useContext(PlayerProgressContext);
  if (!ctx) throw new Error("usePlayerProgress must be used within PlayerProvider");
  return ctx;
}

export function usePlayer(): PlayerContextValue {
  return { ...usePlayerTransport(), ...usePlayerProgress() };
}
