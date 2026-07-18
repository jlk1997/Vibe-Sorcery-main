import { authHeader } from "./media";

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
  let audio: HTMLAudioElement | null = null;
  let hls: { destroy: () => void } | null = null;

  function destroyMedia() {
    audio?.pause();
    hls?.destroy();
    hls = null;
    audio = null;
  }

  function wireAudio(el: HTMLAudioElement) {
    el.preload = "metadata";
    el.addEventListener("timeupdate", () => callbacks.onTimeUpdate?.(el.currentTime));
    el.addEventListener("durationchange", () => callbacks.onDurationChange?.(el.duration || 0));
    el.addEventListener("play", () => callbacks.onPlayingChange?.(true));
    el.addEventListener("pause", () => callbacks.onPlayingChange?.(false));
    el.addEventListener("ended", () => {
      callbacks.onPlayingChange?.(false);
      callbacks.onEnded?.();
    });
    el.addEventListener("error", () => callbacks.onError?.("playback_failed"));
  }

  async function attachDirect(url: string): Promise<void> {
    destroyMedia();
    audio = new Audio();
    wireAudio(audio);
    audio.controlsList = "nodownload";
    audio.src = url;
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        audio?.removeEventListener("canplay", onReady);
        audio?.removeEventListener("error", onFail);
        resolve();
      };
      const onFail = () => {
        audio?.removeEventListener("canplay", onReady);
        audio?.removeEventListener("error", onFail);
        reject(new Error("direct_playback_failed"));
      };
      audio!.addEventListener("canplay", onReady);
      audio!.addEventListener("error", onFail);
      audio!.load();
    });
  }

  async function attachHls(url: string, fallbackUrl?: string): Promise<void> {
    destroyMedia();
    audio = new Audio();
    wireAudio(audio);

    const Hls = (await import("hls.js")).default;
    if (!Hls.isSupported()) {
      await attachDirect(fallbackUrl || url);
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const instance = new Hls({
        xhrSetup: (xhr, reqUrl) => {
          const headers = authHeader();
          Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
          if (typeof reqUrl === "string" && reqUrl.includes("ticket=")) {
            xhr.withCredentials = false;
          }
        },
      });

      instance.on(Hls.Events.MEDIA_ATTACHED, () => instance.loadSource(url));
      instance.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        instance.destroy();
        hls = null;
        if (fallbackUrl && fallbackUrl !== url) {
          attachDirect(fallbackUrl).then(resolve).catch(reject);
        } else {
          reject(new Error("hls_playback_failed"));
        }
      });
      instance.on(Hls.Events.MANIFEST_PARSED, () => resolve());

      instance.attachMedia(audio!);
      hls = instance;
    });
  }

  async function attach(url: string, fallbackUrl?: string): Promise<void> {
    if (url.includes(".m3u8")) {
      try {
        await attachHls(url, fallbackUrl);
        return;
      } catch {
        if (fallbackUrl && fallbackUrl !== url) {
          await attachDirect(fallbackUrl);
          return;
        }
        throw new Error("playback_failed");
      }
    }
    await attachDirect(url);
  }

  return {
    play: async (url, fallbackUrl) => {
      await attach(url, fallbackUrl);
      try {
        await audio!.play();
      } catch (err) {
        if (fallbackUrl && fallbackUrl !== url) {
          await attachDirect(fallbackUrl);
          await audio!.play();
          return;
        }
        throw err;
      }
    },
    prepare: async (url, fallbackUrl) => {
      await attach(url, fallbackUrl);
    },
    isReady: () => audio !== null,
    pause: () => audio?.pause(),
    resume: async () => {
      if (!audio) return;
      await audio.play();
    },
    seek: (time) => {
      if (audio) audio.currentTime = time;
    },
    destroy: destroyMedia,
  };
}
