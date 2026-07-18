export type PlayerTrack = {
  id: string;
  title: string;
  audioUrl: string;
  hlsUrl?: string | null;
  coverUrl?: string | null;
  moods?: string[];
  artist?: string;
  source?: string;
};

export type PlayTrackOptions = {
  queue?: PlayerTrack[];
  startIndex?: number;
  navigate?: boolean;
};

export function workToPlayerTrack(
  work: {
    id: string;
    title: string;
    audio_url: string;
    hls_url?: string | null;
    cover_url?: string | null;
    moods?: string[];
  },
  opts?: { artist?: string; source?: string },
): PlayerTrack {
  return {
    id: work.id,
    title: work.title,
    audioUrl: work.audio_url,
    hlsUrl: work.hls_url,
    coverUrl: work.cover_url,
    moods: work.moods,
    artist: opts?.artist,
    source: opts?.source,
  };
}

export const MOOD_COLORS: Record<string, string> = {
  calm: "#2dd4bf",
  peaceful: "#38bdf8",
  melancholy: "#818cf8",
  nostalgic: "#a78bfa",
  hopeful: "#34d399",
  energetic: "#f472b6",
  intense: "#fb7185",
  dark: "#6366f1",
  dreamy: "#c084fc",
  joyful: "#fbbf24",
};

export function moodAccent(moods?: string[]): string {
  if (!moods?.length) return "#2dd4bf";
  const key = moods[0].toLowerCase();
  return MOOD_COLORS[key] || "#2dd4bf";
}
