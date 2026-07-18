import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { vibeApi } from "../../services/api";
import { socialPage } from "../../constants/routes";
import { Icon, LoadingSkeleton } from "../ui";
import "./DuelsRow.scss";

type DuelItem = {
  id: string;
  status: string;
  challenger?: string;
  opponent?: string;
  challenger_votes?: number;
  opponent_votes?: number;
  challenger_work?: { title?: string; cover_url?: string };
  opponent_work?: { title?: string; cover_url?: string };
};

export function DuelsRow() {
  const { copy } = useLocale();
  const s = copy.socialUi;
  const d = copy.discoverUi;
  const [duels, setDuels] = useState<DuelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    vibeApi
      .listDuels("voting")
      .then((res) => setDuels((res.duels as DuelItem[]).slice(0, 8)))
      .catch(() => {
        setDuels([]);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openDuelsHub() {
    Taro.navigateTo({ url: socialPage("duels") });
  }

  return (
    <View className="duels-row">
      <View className="duels-row__head">
        <Icon name="remix" size="sm" accent />
        <Text className="duels-row__title">{s.duelsLive}</Text>
        <Text className="duels-row__more" onClick={openDuelsHub}>
          {s.seeAll}
        </Text>
      </View>

      {loading && <LoadingSkeleton count={2} variant="line" />}

      {!loading && error && (
        <View className="duels-row__banner duels-row__banner--error">
          <Text className="duels-row__banner-text">{s.duelsLoadFail}</Text>
          <Text className="duels-row__banner-link" onClick={() => void load()}>
            {d.retry}
          </Text>
        </View>
      )}

      {!loading && !error && duels.length === 0 && (
        <View className="duels-row__banner" onClick={openDuelsHub}>
          <Text className="duels-row__banner-text">{s.duelsRowEmpty}</Text>
          <Text className="duels-row__banner-hint">{s.duelsRowHint}</Text>
          <Text className="duels-row__banner-link">{s.duelsRowCta} →</Text>
        </View>
      )}

      {!loading && !error && duels.length > 0 && (
        <ScrollView scrollX enableFlex className="duels-row__scroll">
          <View className="duels-row__track">
            {duels.map((item) => (
              <View
                key={item.id}
                className="duels-row__card"
                onClick={() => Taro.navigateTo({ url: socialPage("duel", { id: item.id }) })}
              >
                <View className="duels-row__card-head">
                  <Text className="duels-row__side">A</Text>
                  <Text className="duels-row__vs">VS</Text>
                  <Text className="duels-row__side">B</Text>
                </View>
                <Text className="duels-row__match" numberOfLines={1}>
                  @{item.challenger} · {item.opponent ? `@${item.opponent}` : s.duelOpen}
                </Text>
                <Text className="duels-row__votes">
                  {s.duelVotes} {item.challenger_votes ?? 0} : {item.opponent_votes ?? 0}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
