import { useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { stackPage, socialPage } from "../../constants/routes";
import { vibeApi } from "../../services/api";
import { requireAuth } from "../../utils/auth";
import { setItem } from "../../platform/storage";
import { Button } from "../ui";
import "./ListenCheckinSheet.scss";

type Props = {
  workId: string;
  workTitle?: string;
  listenRatio: number;
  onDone?: () => void;
  onDismiss?: () => void;
};

export function ListenCheckinSheet({ workId, workTitle, listenRatio, onDone, onDismiss }: Props) {
  const { copy } = useLocale();
  const e = copy.engagementUi;
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  const moods = [
    { key: "calm" as const, arousal: 3, valence: 6, label: e.moodCalm },
    { key: "joy" as const, arousal: 6, valence: 8, label: e.moodJoy },
    { key: "melancholy" as const, arousal: 3, valence: 3, label: e.moodMelancholy },
    { key: "energy" as const, arousal: 8, valence: 7, label: e.moodEnergy },
  ];

  async function submit(mood: (typeof moods)[number]) {
    if (!requireAuth()) return;
    setSubmitting(true);
    try {
      const res = await vibeApi.listenCheckin({
        work_id: workId,
        listen_ratio: listenRatio,
        arousal: mood.arousal,
        valence: mood.valence,
        mood_tags: [mood.key],
      });
      if (res.credits_granted) {
        Taro.showToast({ title: e.checkinReward.replace("{n}", String(res.credits_granted)), icon: "success" });
      } else if (res.duplicate) {
        Taro.showToast({ title: e.checkinDuplicate, icon: "none" });
      } else {
        Taro.showToast({ title: e.checkinThanks, icon: "success" });
      }
      setCompleted(true);
    } catch {
      Taro.showToast({ title: e.checkinFail, icon: "none" });
    } finally {
      setSubmitting(false);
    }
  }

  function goVariation() {
    onDone?.();
    setItem("create:seedWorkId", workId);
    setItem("create:mode", "variation");
    if (workTitle) setItem("create:seedTitle", workTitle);
    Taro.switchTab({ url: "/pages/create/index" });
  }

  async function goDuel() {
    if (!requireAuth()) return;
    try {
      const res = await vibeApi.createDuel(workId);
      onDone?.();
      Taro.navigateTo({ url: socialPage("duel", { id: res.duel_id || res.id }) });
    } catch {
      Taro.navigateTo({ url: stackPage("work", { id: workId }) });
    }
  }

  function finish() {
    onDone?.();
  }

  return (
    <View className="listen-checkin">
      <View className="listen-checkin__backdrop" onClick={onDismiss} />
      <View className="listen-checkin__panel">
        {!completed ? (
          <>
            <Text className="listen-checkin__title">{e.checkinTitle}</Text>
            {workTitle ? <Text className="listen-checkin__sub">{workTitle}</Text> : null}
            <Text className="listen-checkin__hint">{e.checkinHint}</Text>
            <View className="listen-checkin__moods">
              {moods.map((m) => (
                <Button key={m.key} size="sm" variant="secondary" disabled={submitting} onClick={() => submit(m)}>
                  {m.label}
                </Button>
              ))}
            </View>
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              {e.checkinSkip}
            </Button>
          </>
        ) : (
          <>
            <Text className="listen-checkin__title">{e.checkinThanks}</Text>
            <Button size="sm" variant="primary" block onClick={goVariation}>
              {e.checkinCtaVariation}
            </Button>
            <Button size="sm" variant="secondary" block onClick={() => void goDuel()}>
              {e.checkinCtaDuel}
            </Button>
            <Button size="sm" variant="ghost" onClick={finish}>
              {e.checkinDone}
            </Button>
          </>
        )}
      </View>
    </View>
  );
}
