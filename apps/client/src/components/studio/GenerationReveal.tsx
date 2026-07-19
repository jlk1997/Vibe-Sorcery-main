import { useEffect, useState } from "react";
import { View, Text, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { workToPlayerTrack } from "@vibe-sorcery/types";
import { vibeApi } from "../../services/api";
import { isWorkVersionConflict } from "@vibe-sorcery/api-client";
import { usePlayer } from "../../contexts/PlayerProvider";
import { Button, Input } from "../ui";
import { AiGeneratedBadge } from "../legal/AiGeneratedBadge";
import "./GenerationReveal.scss";

type Props = {
  workId: string;
  title?: string;
  coverUrl?: string;
  moods?: string[];
  onDismiss?: () => void;
  onTitleChange?: (title: string) => void;
};

export function GenerationReveal({ workId, title, coverUrl, moods = [], onDismiss, onTitleChange }: Props) {
  const { copy } = useLocale();
  const r = copy.generation.reveal;
  const { playTrack } = usePlayer();
  const [compact, setCompact] = useState(false);
  const [resolvedCover, setResolvedCover] = useState(coverUrl || "");
  const [resolvedTitle, setResolvedTitle] = useState(title || "");
  const [workVersion, setWorkVersion] = useState<number | undefined>(undefined);
  const [editingTitle, setEditingTitle] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setCompact(true), 2500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (title) setResolvedTitle(title);
    if (coverUrl) setResolvedCover(coverUrl);
    if (title && coverUrl) return;
    vibeApi.getWork(workId).then((w) => {
      if (!title) setResolvedTitle(w.title);
      if (!coverUrl && w.cover_url) setResolvedCover(w.cover_url);
      if (w.version != null) setWorkVersion(w.version);
    }).catch(() => {});
  }, [workId, title, coverUrl]);

  async function saveTitle(nextTitle: string) {
    const trimmed = nextTitle.trim();
    if (!trimmed || trimmed === resolvedTitle) {
      setEditingTitle(false);
      return;
    }
    setSavingTitle(true);
    try {
      const updated = await vibeApi.updateWork(workId, { title: trimmed, expectedVersion: workVersion });
      setResolvedTitle(updated.title);
      setWorkVersion(updated.version);
      onTitleChange?.(updated.title);
      Taro.showToast({ title: r.titleSaved, icon: "success" });
    } catch (err) {
      if (isWorkVersionConflict(err)) {
        try {
          const fresh = await vibeApi.getWork(workId);
          setResolvedTitle(fresh.title);
          if (fresh.version != null) setWorkVersion(fresh.version);
          Taro.showToast({ title: copy.generation.workVersionConflict, icon: "none" });
        } catch {
          Taro.showToast({ title: r.titleSaveFail, icon: "none" });
        }
      } else {
        Taro.showToast({ title: r.titleSaveFail, icon: "none" });
      }
    } finally {
      setSavingTitle(false);
      setEditingTitle(false);
    }
  }

  async function playNow() {
    const w = await vibeApi.getWork(workId);
    playTrack(workToPlayerTrack(w, { source: "generation" }), { navigate: true });
  }

  async function collect() {
    try {
      await vibeApi.collectWork(workId);
      Taro.showToast({ title: r.collectSuccess, icon: "success" });
    } catch {
      Taro.showToast({ title: r.collectFail, icon: "none" });
    }
  }

  return (
    <View className={compact ? "gen-reveal gen-reveal--compact" : "gen-reveal"} onClick={compact ? onDismiss : undefined}>
      <View className="gen-reveal__card">
        <View className="gen-reveal__cover-wrap">
          {resolvedCover ? (
            <Image className="gen-reveal__cover" src={resolvedCover} mode="aspectFill" />
          ) : (
            <View className="gen-reveal__cover gen-reveal__cover--placeholder" />
          )}
        </View>
        <View className="gen-reveal__body">
          <AiGeneratedBadge
            className="gen-reveal__ai-badge"
            prominent={!compact}
            compact={compact}
          />
          {!compact && <Text className="gen-reveal__eyebrow">{r.title}</Text>}
          {editingTitle ? (
            <Input
              className="gen-reveal__title-input"
              value={resolvedTitle}
              maxlength={60}
              focus
              onInput={(e) => setResolvedTitle(e.detail.value)}
              onBlur={() => void saveTitle(resolvedTitle)}
              onConfirm={() => void saveTitle(resolvedTitle)}
            />
          ) : (
            <View
              className="gen-reveal__title-row"
              onClick={(e) => {
                e.stopPropagation();
                setEditingTitle(true);
              }}
            >
              <Text className="gen-reveal__title">{resolvedTitle || "—"}</Text>
              <Text className="gen-reveal__title-edit">{r.titleEdit}</Text>
            </View>
          )}
          {savingTitle && <Text className="gen-reveal__title-saving typo-meta">{r.titleEdit}…</Text>}
          {!compact && <Text className="gen-reveal__subtitle">{r.subtitle}</Text>}
          {moods.length > 0 && (
            <Text className="gen-reveal__moods">{moods.slice(0, 3).join(" · ")}</Text>
          )}
          <View className="gen-reveal__actions">
            <Button variant="primary" size="sm" onClick={playNow}>
              {r.play}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => Taro.navigateTo({ url: `/pages/provenance/index?workId=${workId}` })}
            >
              {r.provenance}
            </Button>
            <Button variant="ghost" size="sm" onClick={collect}>
              {r.collect}
            </Button>
          </View>
        </View>
      </View>
    </View>
  );
}
