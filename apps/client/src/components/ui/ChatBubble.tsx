import { View, Text } from "@tarojs/components";
import { useLocale } from "@vibe-sorcery/i18n";
import { Icon } from "./Icon";
import { Avatar } from "./Avatar";
import { clsx } from "../../utils/clsx";
import "./ChatBubble.scss";

type Props = {
  role: "user" | "assistant";
  content: string;
  userName?: string;
};

export function ChatBubble({ role, content, userName }: Props) {
  const { copy } = useLocale();
  const isUser = role === "user";

  return (
    <View className={clsx("chat-bubble", isUser ? "chat-bubble--user" : "chat-bubble--assistant")}>
      {!isUser && (
        <View className="chat-bubble__avatar chat-bubble__avatar--bot">
          <Icon name="sigil" accent size="md" />
        </View>
      )}
      <View className="chat-bubble__body">
        {!isUser && <Text className="chat-bubble__label">{copy.copilotUi.title}</Text>}
        <Text className="chat-bubble__text">{content}</Text>
      </View>
      {isUser && (
        <View className="chat-bubble__avatar">
          <Avatar name={userName || "U"} size="sm" />
        </View>
      )}
    </View>
  );
}
