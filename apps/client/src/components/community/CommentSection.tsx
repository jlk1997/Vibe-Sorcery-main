import { useEffect, useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { vibeApi } from "../../services/api";
import { requireAuth } from "../../utils/auth";
import { Button, Icon, Input } from "../ui";
import "./CommentSection.scss";

type Comment = {
  id: string;
  user_id: string;
  username: string;
  content: string;
  parent_id?: string | null;
  is_filtered?: boolean;
  created_at: string;
};

type Props = {
  postId: string;
  commentCount?: number;
  onCountChange?: (count: number) => void;
  myUserId?: string | null;
  myUsername?: string | null;
};

function initial(name: string) {
  return (name || "?").slice(0, 1).toUpperCase();
}

export function CommentSection({ postId, commentCount = 0, onCountChange, myUserId, myUsername }: Props) {
  const { copy } = useLocale();
  const d = copy.discoverUi;
  const social = copy.socialUi;
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(commentCount);

  useEffect(() => {
    setCount(commentCount);
  }, [commentCount]);

  async function loadComments() {
    setLoading(true);
    try {
      const list = await vibeApi.listComments(postId);
      setComments(list);
      setCount(list.length);
      onCountChange?.(list.length);
    } catch {
      Taro.showToast({ title: d.commentLoadError, icon: "none" });
    } finally {
      setLoading(false);
    }
  }

  async function toggle() {
    if (!open) await loadComments();
    setOpen(!open);
  }

  async function submit() {
    if (!requireAuth()) return;
    const text = draft.trim();
    if (text.length < 2) {
      Taro.showToast({ title: d.commentMin, icon: "none" });
      return;
    }
    try {
      const c = await vibeApi.addComment(postId, text, replyTo?.id);
      setComments((prev) => [...prev, c]);
      setDraft("");
      setReplyTo(null);
      const next = count + 1;
      setCount(next);
      onCountChange?.(next);
      Taro.showToast({ title: d.commentPosted, icon: "success" });
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err ? String((err as { message: string }).message) : d.commentSendFail;
      Taro.showToast({ title: msg || d.commentSendFail, icon: "none" });
    }
  }

  async function removeComment(commentId: string) {
    try {
      await vibeApi.deleteComment(postId, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      const next = Math.max(0, count - 1);
      setCount(next);
      onCountChange?.(next);
    } catch {
      Taro.showToast({ title: d.commentSendFail, icon: "none" });
    }
  }

  async function reportComment(commentId: string) {
    if (!requireAuth()) return;
    const reasons = [social.reportReasonSpam, social.reportReasonAbuse, social.reportReasonOther];
    try {
      const picked = await Taro.showActionSheet({ itemList: reasons });
      const reason = reasons[picked.tapIndex] || social.reportCommentReason;
      await vibeApi.reportComment(commentId, reason);
      Taro.showToast({ title: d.reportSuccess, icon: "success" });
    } catch {
      /* user cancelled */
    }
  }

  return (
    <View className="comments">
      <View className={`comments__toggle ${open ? "comments__toggle--open" : ""}`} onClick={toggle}>
        <Icon name="comment" size="sm" accent={open} />
        <Text className="comments__toggle-text">
          {count} {d.comments}
        </Text>
        <Icon name="chevronDown" size="sm" className={open ? "comments__chevron-flip" : undefined} />
      </View>
      {open && (
        <View className="comments__panel">
          {loading && <Text className="comments__muted">{d.commentLoading}</Text>}
          {!loading && comments.length === 0 && <Text className="comments__muted">{d.noComments}</Text>}
          {comments.map((c) => {
            const parent = c.parent_id ? comments.find((x) => x.id === c.parent_id) : null;
            const isMine = (myUserId && c.user_id === myUserId) || (myUsername && c.username === myUsername);
            return (
              <View key={c.id} className={`comments__item ${c.parent_id ? "comments__item--reply" : ""}`}>
                <View className="comments__bubble-avatar">
                  <Text>{initial(c.username)}</Text>
                </View>
                <View className="comments__bubble">
                  <View className="comments__bubble-head">
                    <Text className="comments__user">@{c.username}</Text>
                    <View className="comments__actions">
                      {!isMine && (
                        <Text className="comments__reply" onClick={() => setReplyTo(c)}>
                          {social.replyComment}
                        </Text>
                      )}
                      {!isMine && (
                        <Text className="comments__report" onClick={() => void reportComment(c.id)}>
                          {d.report}
                        </Text>
                      )}
                      {isMine && (
                        <Text className="comments__delete" onClick={() => removeComment(c.id)}>
                          {social.deleteComment}
                        </Text>
                      )}
                    </View>
                  </View>
                  {parent && (
                    <Text className="comments__reply-to">
                      {social.replyingTo.replace("{user}", parent.username)}
                    </Text>
                  )}
                  <Text className={`comments__text ${c.is_filtered ? "comments__text--filtered" : ""}`}>
                    {c.content}
                    {c.is_filtered ? ` (${social.filtered})` : ""}
                  </Text>
                </View>
              </View>
            );
          })}
          {replyTo && (
            <Text className="comments__reply-banner" onClick={() => setReplyTo(null)}>
              {social.replyingTo.replace("{user}", replyTo.username)} · {social.cancelReply}
            </Text>
          )}
          <View className="comments__composer">
            <Input
              className="comments__input"
              placeholder={replyTo ? social.replyPlaceholder : d.commentPlaceholder}
              value={draft}
              onInput={(e) => setDraft(e.detail.value)}
            />
            <Button size="sm" variant="primary" onClick={submit}>
              {d.send}
            </Button>
          </View>
        </View>
      )}
    </View>
  );
}
