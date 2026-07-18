import Taro from "@tarojs/taro";

export type AudioCallbacks = {
  onTimeUpdate?: (time: number) => void;
  onDurationChange?: (duration: number) => void;
  onPlayingChange?: (playing: boolean) => void;
  onEnded?: () => void;
  onError?: (message: string) => void;
};

export type AudioEngine = {
  play: (url: string, fallbackUrl?: string) => Promise<void>;
  prepare: (url: string, fallbackUrl?: string) => Promise<void>;
  isReady: () => boolean;
  pause: () => void;
  resume: () => Promise<void>;
  seek: (time: number) => void;
  destroy: () => void;
};

export function createAudioEngine(callbacks: AudioCallbacks): AudioEngine {
  // Native streaming playback. The earlier "load or init native decode so fail" /
  // "data error" failures were caused by the backend gzip-compressing the MP3
  // stream (WeChat's media loader does not inflate gzip); with the gateway now
  // serving Content-Encoding: identity the native decoder streams fine and avoids
  // WebAudio's whole-song in-memory decode (heavy for long tracks).
  const ctx = Taro.createInnerAudioContext();
  // Music apps should ignore the hardware mute switch when possible.
  try {
    (ctx as { obeyMuteSwitch?: boolean }).obeyMuteSwitch = false;
  } catch {
    /* ignore */
  }

  let activeSrc = "";
  let ready = false;
  let pendingFallback: string | null = null;
  let triedFallback = false;
  let playResolve: (() => void) | null = null;
  let playReject: ((err: Error) => void) | null = null;

  const clearPlayWaiters = () => {
    playResolve = null;
    playReject = null;
  };

  const settleOk = () => {
    const resolve = playResolve;
    clearPlayWaiters();
    resolve?.();
  };

  const settleFail = (message: string) => {
    const reject = playReject;
    clearPlayWaiters();
    callbacks.onError?.(message);
    callbacks.onPlayingChange?.(false);
    reject?.(new Error(message));
  };

  const startSrc = (url: string) => {
    ready = false;
    activeSrc = url;
    ctx.src = url;
    try {
      ctx.play();
    } catch {
      /* async errors arrive via onError */
    }
  };

  const markReadyFromMeta = () => {
    const d = Number(ctx.duration);
    if (Number.isFinite(d) && d > 0) {
      callbacks.onDurationChange?.(d);
    }
    ready = true;
    settleOk();
  };

  ctx.onTimeUpdate(() => {
    callbacks.onTimeUpdate?.(ctx.currentTime);
    const d = Number(ctx.duration);
    if (Number.isFinite(d) && d > 0) {
      callbacks.onDurationChange?.(d);
    }
  });
  ctx.onCanplay(() => markReadyFromMeta());
  ctx.onPlay(() => {
    callbacks.onPlayingChange?.(true);
    // Some WeChat builds fire play before canplay with duration 0 — still treat as success.
    if (playResolve) markReadyFromMeta();
  });
  ctx.onPause(() => callbacks.onPlayingChange?.(false));
  ctx.onEnded(() => {
    callbacks.onPlayingChange?.(false);
    callbacks.onEnded?.();
  });
  ctx.onError((res) => {
    const errObj = (res && typeof res === "object" ? res : {}) as { errMsg?: string; errCode?: number };
    const message =
      (errObj.errMsg && String(errObj.errMsg)) ||
      (errObj.errCode != null ? `audio_err_${errObj.errCode}` : "playback_failed");
    // Surface the real WeChat audio error (10001 system / 10002 network·domain /
    // 10003 file / 10004 format) so real-device debugging shows the true cause.
    console.error("[audio] InnerAudioContext error", {
      errCode: errObj.errCode,
      errMsg: errObj.errMsg,
      src: activeSrc,
    });
    if (!triedFallback && pendingFallback && pendingFallback !== activeSrc) {
      triedFallback = true;
      const next = pendingFallback;
      pendingFallback = null;
      startSrc(next);
      return;
    }
    ready = false;
    settleFail(message);
  });

  return {
    play: async (url, fallbackUrl) => {
      if (!url) throw new Error("playback_failed");
      triedFallback = false;
      pendingFallback = fallbackUrl && fallbackUrl !== url ? fallbackUrl : null;
      return new Promise<void>((resolve, reject) => {
        playResolve = resolve;
        playReject = reject;
        startSrc(url);
      });
    },
    prepare: async (url, fallbackUrl) => {
      if (!url) throw new Error("playback_failed");
      triedFallback = false;
      pendingFallback = fallbackUrl && fallbackUrl !== url ? fallbackUrl : null;
      ready = false;
      activeSrc = url;
      ctx.src = url;
    },
    isReady: () => ready && !!activeSrc,
    pause: () => ctx.pause(),
    resume: async () => {
      if (!ready || !activeSrc) throw new Error("not_ready");
      return new Promise<void>((resolve, reject) => {
        playResolve = resolve;
        playReject = reject;
        try {
          ctx.play();
        } catch {
          settleFail("playback_failed");
          return;
        }
        // If already buffered, canplay may not fire again — resolve on next tick if playing.
        setTimeout(() => {
          if (playResolve) settleOk();
        }, 300);
      });
    },
    seek: (time) => {
      ctx.seek(time);
    },
    destroy: () => {
      clearPlayWaiters();
      ready = false;
      activeSrc = "";
      ctx.destroy();
    },
  };
}
