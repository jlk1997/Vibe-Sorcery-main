import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { STACK_PAGE_ROUTES } from "../../constants/routes";
import { useLocale } from "@vibe-sorcery/i18n";
import { Avatar, CreatorLevelBadge, SectionLabel } from "../ui";
import "./RisingCreatorsRow.scss";

export type RisingCreator = {
  username: string;
  display_name: string;
  avatar_url?: string;
  posts_count: number;
  creator_level: string;
};

type Props = {
  creators: RisingCreator[];
};

export function RisingCreatorsRow({ creators }: Props) {
  const { copy } = useLocale();
  const d = copy.discoverUi;
  if (!creators.length) return null;

  return (
    <View className="rising-creators">
      <SectionLabel>{d.risingCreatorsTitle}</SectionLabel>
      <View className="rising-creators__scroll">
        {creators.map((c) => (
          <View
            key={c.username}
            className="rising-creators__card"
            onClick={() => Taro.navigateTo({ url: `${STACK_PAGE_ROUTES.user}?username=${c.username}` })}
          >
            <Avatar name={c.display_name} src={c.avatar_url} size="md" />
            <Text className="rising-creators__name">{c.display_name}</Text>
            <CreatorLevelBadge level={c.creator_level} compact />
            <Text className="rising-creators__meta">
              {d.risingCreatorsPosts.replace("{n}", String(c.posts_count))}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
