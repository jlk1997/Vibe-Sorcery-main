import type { PlayerTrack } from "@vibe-sorcery/types";
import { useLocale } from "@vibe-sorcery/i18n";
import { usePlayerTransport } from "../../contexts/PlayerProvider";
import { Button, Icon } from "../ui";

type Props = {
  track: PlayerTrack;
  queue?: PlayerTrack[];
  label?: string;
};

export function PlayTrackButton({ track, queue, label }: Props) {
  const { copy } = useLocale();
  const pl = copy.player;
  const playLabel = label || pl.play;
  const { playTrack, currentTrackId, isPlaying, togglePlay } = usePlayerTransport();
  const active = currentTrackId === track.id;

  return (
    <Button
      size="sm"
      variant={active && isPlaying ? "primary" : "secondary"}
      onClick={() => {
        if (active) {
          togglePlay();
          return;
        }
        playTrack(track, { queue, navigate: false });
      }}
    >
      {active && isPlaying ? (
        <>
          <Icon name="pause" size="sm" /> {pl.pause}
        </>
      ) : active ? (
        <>
          <Icon name="play" size="sm" accent /> {pl.resume}
        </>
      ) : (
        <>
          <Icon name="play" size="sm" accent /> {playLabel}
        </>
      )}
    </Button>
  );
}
