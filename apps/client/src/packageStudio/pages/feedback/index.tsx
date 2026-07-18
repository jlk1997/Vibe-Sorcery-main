import { useState, useEffect } from "react";
import { View } from "@tarojs/components";
import Taro, { useRouter, useShareAppMessage } from "@tarojs/taro";
import { STACK_PAGE_ROUTES } from "../../../constants/routes";
import { useLocale } from "@vibe-sorcery/i18n";
import { PageShell } from "../../../components/PageShell";
import { Button, Card, MoodShiftViz, MoodSpectrum, StatusLine, TextArea, CelebrationSheet } from "../../../components/ui";
import { MoodSharePoster } from "../../../components/engagement/MoodSharePoster";
import { vibeApi } from "../../../services/api";
import { bootstrapAuth, requireAuth } from "../../../utils/auth";
import { useCreditsOptional } from "../../../contexts/CreditsProvider";
import { applyCreditsResponse, taskCreditsGranted } from "../../../utils/creditsSync";
import "./index.scss";

export default function FeedbackPage() {
  const router = useRouter();
  const { copy } = useLocale();
  const f = copy.feedbackUi;
  const creditsCtx = useCreditsOptional();
  const playlistId = router.params.playlistId || "";
  const title = decodeURIComponent(router.params.title || f.defaultJourneyTitle);
  const [before, setBefore] = useState(4);
  const [after, setAfter] = useState(7);
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<{ mood_before: number; mood_after: number; note?: string } | null>(null);
  const [celebrateOpen, setCelebrateOpen] = useState(false);

  useEffect(() => {
    if (!playlistId) return;
    vibeApi.getPlaylistFeedback(playlistId).then(setHistory).catch(() => {});
  }, [playlistId]);

  useShareAppMessage(() => ({
    title: f.shareTitle.replace("{title}", title),
    path: playlistId ? `${STACK_PAGE_ROUTES.playlist}?id=${playlistId}` : "/pages/create/index",
  }));

  async function submit() {
    bootstrapAuth();
    if (!requireAuth() || !playlistId) return;
    setSubmitting(true);
    try {
      const res = await vibeApi.submitPlaylistFeedback(playlistId, {
        mood_before: before,
        mood_after: after,
        felt_shift: after > before,
        note: note.trim() || undefined,
      });
      applyCreditsResponse(creditsCtx, res);
      const taskGrant = taskCreditsGranted(res);
      if (taskGrant) {
        Taro.showToast({ title: copy.progressUi.taskReward.replace("{n}", String(taskGrant)), icon: "success" });
      }
      await vibeApi.trackEvent("mood_feedback_submitted", { playlist_id: playlistId });
      setDone(true);
      setCelebrateOpen(true);
      Taro.showToast({ title: f.thanks, icon: "success" });
    } catch {
      Taro.showToast({ title: f.submitFail, icon: "none" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageShell label={f.label} title={f.title} subtitle={title} wide immersive ambient>
      {history && (
        <Card flat className="feedback-page__history">
          <MoodShiftViz
            before={history.mood_before}
            after={history.mood_after}
            labels={f.moodScale}
            beforeTitle={f.beforeSection}
            afterTitle={f.afterSection}
          />
        </Card>
      )}

      {!done && (
        <>
          <MoodShiftViz before={before} after={after} labels={f.moodScale} beforeTitle={f.beforeSection} afterTitle={f.afterSection} />

          <Card flat className="feedback-page__pickers">
            <MoodSpectrum title={f.beforeSection} value={before} onChange={setBefore} labels={f.moodScale} />
            <MoodSpectrum title={f.afterSection} value={after} onChange={setAfter} labels={f.moodScale} />

            {after > before && <StatusLine tone="success">{f.shiftSuccess}</StatusLine>}
            {after <= before && after !== before && <StatusLine tone="info">{f.shiftInfo}</StatusLine>}

            <TextArea
              label={f.noteLabel}
              placeholder={f.notePlaceholder}
              value={note}
              onInput={(e) => setNote(e.detail.value)}
              maxlength={300}
            />
          </Card>

          <Button variant="primary" block loading={submitting} onClick={submit} className="feedback-page__submit">
            {f.submit}
          </Button>
        </>
      )}

      {done && (
        <View className="feedback-page__done">
          <MoodSharePoster title={title} before={before} after={after} />
          <StatusLine tone="success">{f.done}</StatusLine>
          <Button variant="secondary" openType="share" block>
            {f.share}
          </Button>
          <Button variant="ghost" block onClick={() => Taro.switchTab({ url: "/pages/create/index" })}>
            {f.again}
          </Button>
          <Button variant="ghost" block onClick={() => Taro.switchTab({ url: "/pages/feed/index" })}>
            {f.discover}
          </Button>
        </View>
      )}

      <CelebrationSheet
        open={celebrateOpen}
        variant="playlist"
        onClose={() => setCelebrateOpen(false)}
        shareTitle={title}
      />
    </PageShell>
  );
}
