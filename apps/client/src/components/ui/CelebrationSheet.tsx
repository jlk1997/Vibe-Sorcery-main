import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { BottomSheet, Button } from "./index";
import "./CelebrationSheet.scss";

type Props = {
  open: boolean;
  variant: "publish" | "playlist" | "firstTrack";
  onClose: () => void;
  shareTitle?: string;
  upsellLabel?: string;
  onUpsell?: () => void;
};

export function CelebrationSheet({ open, variant, onClose, shareTitle, upsellLabel, onUpsell }: Props) {
  const { copy } = useLocale();
  const c = copy.celebrationUi;
  const title =
    variant === "publish" ? c.publishTitle : variant === "playlist" ? c.playlistTitle : c.firstTrackTitle;
  const body =
    variant === "publish" ? c.publishBody : variant === "playlist" ? c.playlistBody : c.firstTrackBody;

  function share() {
    if (process.env.TARO_ENV === "weapp" && shareTitle) {
      Taro.showShareMenu({ withShareTicket: true });
    }
    onClose();
  }

  if (!open) return null;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <View className="celebration-sheet__footer">
          <Button variant="primary" block onClick={() => Taro.switchTab({ url: "/pages/create/index" })}>
            {c.continueCreate}
          </Button>
          {upsellLabel && onUpsell && (
            <Button variant="secondary" block onClick={onUpsell}>
              {upsellLabel}
            </Button>
          )}
          {process.env.TARO_ENV === "weapp" && (
            <Button variant="secondary" block onClick={share}>
              {c.share}
            </Button>
          )}
        </View>
      }
    >
      <View className="celebration-sheet">
        <View className="celebration-sheet__confetti" aria-hidden />
        <Text className="celebration-sheet__body">{body}</Text>
      </View>
    </BottomSheet>
  );
}
