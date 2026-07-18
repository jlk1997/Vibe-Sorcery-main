import { useEffect, useState } from "react";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { vibeApi } from "../../services/api";
import { isLoggedIn, requireAuth } from "../../utils/auth";
import { Button } from "../ui";

type Props = {
  username: string;
  size?: "mini" | "default";
  /** When set, skips profile fetch (feed provides batch follow state). */
  initialFollowing?: boolean;
};

export function FollowButton({ username, size = "mini", initialFollowing }: Props) {
  const { copy } = useLocale();
  const a = copy.actions;
  const [following, setFollowing] = useState(initialFollowing ?? false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialFollowing !== undefined) {
      setFollowing(initialFollowing);
      return;
    }
    if (!username || !isLoggedIn()) return;
    let cancelled = false;
    vibeApi
      .getUserProfile(username)
      .then((p) => {
        if (!cancelled) setFollowing(Boolean(p.is_following));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [username, initialFollowing]);

  async function toggle() {
    if (!requireAuth()) return;
    setLoading(true);
    try {
      const res = await vibeApi.followUser(username);
      setFollowing(res.following);
    } catch {
      Taro.showToast({ title: copy.notificationsUi.actionFail, icon: "none" });
    } finally {
      setLoading(false);
    }
  }

  if (!username) return null;

  return (
    <Button size={size === "mini" ? "sm" : undefined} variant={following ? "ghost" : "secondary"} loading={loading} onClick={toggle}>
      {following ? a.following : a.follow}
    </Button>
  );
}
