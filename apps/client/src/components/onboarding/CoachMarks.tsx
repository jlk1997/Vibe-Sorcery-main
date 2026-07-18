import { useEffect, useMemo, useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import {
  disableAllOnboarding,
  markPageOnboardingDone,
  setJourneyGuideCollapsed,
  shouldShowPageCoach,
  type CoachPage,
} from "../../utils/onboarding";
import "./CoachMarks.scss";

type Props = {
  page: CoachPage;
  /** Lets parent pages dim fixed docks while the ritual coach is open. */
  onVisibilityChange?: (visible: boolean) => void;
  /** Hide overlay while generation or other blocking UI is active. */
  suppressed?: boolean;
};

/**
 * Page-level coach overlay. Do NOT use useDidShow/useDidHide here —
 * Taro H5 throws "没有找到页面实例" when those hooks run outside page components.
 */
export function CoachMarks({ page, onVisibilityChange, suppressed }: Props) {
  const { copy } = useLocale();
  const o = copy.onboarding;
  const j = copy.journeyUi;
  const d = copy.discoverUi;
  const l = copy.libraryUi;
  const pr = copy.profileUi;
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  const steps = useMemo(() => {
    if (page === "create") {
      return [
        { title: o.step1Title, desc: o.step1Desc },
        { title: o.step2Title, desc: o.step2Desc },
        { title: o.step3Title, desc: o.step3Desc },
      ];
    }
    if (page === "journey") {
      return [
        { title: j.coachStep1Title, desc: j.coachStep1Desc },
        { title: j.coachStep2Title, desc: j.coachStep2Desc },
        { title: j.coachStep3Title, desc: j.coachStep3Desc },
      ];
    }
    if (page === "feed") {
      return [
        { title: d.coachStep1Title, desc: d.coachStep1Desc },
        { title: d.coachStep2Title, desc: d.coachStep2Desc },
        { title: d.coachStep3Title, desc: d.coachStep3Desc },
      ];
    }
    if (page === "library") {
      return [
        { title: l.coachStep1Title, desc: l.coachStep1Desc },
        { title: l.coachStep2Title, desc: l.coachStep2Desc },
        { title: l.coachStep3Title, desc: l.coachStep3Desc },
      ];
    }
    return [
      { title: pr.coachStep1Title, desc: pr.coachStep1Desc },
      { title: pr.coachStep2Title, desc: pr.coachStep2Desc },
      { title: pr.coachStep3Title, desc: pr.coachStep3Desc },
    ];
  }, [page, o, j, d, l, pr]);

  useEffect(() => {
    if (shouldShowPageCoach(page)) {
      setStep(0);
      setVisible(true);
    }
  }, [page]);

  useEffect(() => {
    if (suppressed && visible) {
      setVisible(false);
    }
  }, [suppressed, visible]);

  useEffect(() => {
    onVisibilityChange?.(visible && !suppressed);
    return () => onVisibilityChange?.(false);
  }, [visible, suppressed, onVisibilityChange]);

  if (!visible || suppressed) return null;

  const current = steps[step];
  if (!current) return null;

  const variantClass = page === "create" ? "coach-marks--create" : "coach-marks--default";

  function dismissPage() {
    markPageOnboardingDone(page);
    if (page === "journey") setJourneyGuideCollapsed(true);
    setVisible(false);
  }

  function dismissAll() {
    disableAllOnboarding();
    setVisible(false);
    Taro.showToast({ title: o.neverAgainDone, icon: "none" });
  }

  function next() {
    if (step >= steps.length - 1) dismissPage();
    else setStep(step + 1);
  }

  return (
    <View className={`coach-marks ${variantClass}`}>
      <View className="coach-marks__backdrop" />
      <View className="coach-marks__panel">
        <View className="coach-marks__card">
          <View className="coach-marks__badge">
            <Text className="coach-marks__step">
              {o.stepCounter.replace("{current}", String(step + 1)).replace("{total}", String(steps.length))}
            </Text>
          </View>
          <Text className="coach-marks__title">{current.title}</Text>
          <Text className="coach-marks__desc">{current.desc}</Text>
          <View className="coach-marks__actions">
            <Text className="coach-marks__never" onClick={dismissAll}>
              {o.neverAgain}
            </Text>
            <Text className="coach-marks__skip" onClick={dismissPage}>
              {o.skip}
            </Text>
            <Text className="coach-marks__next" onClick={next}>
              {step >= steps.length - 1 ? o.done : o.next}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
