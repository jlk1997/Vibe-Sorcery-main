import { useEffect, useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { vibeApi } from "../services/api";
import { bootstrapAuth, isLoggedIn } from "../utils/auth";
import { useCreditsOptional } from "../contexts/CreditsProvider";
import { currentLayoutRoute, isImmersiveRoute, STACK_PAGE_ROUTES } from "../constants/routes";
import { useRouteTick } from "../hooks/useRouteTick";
import { syncRootLayoutFromRoute } from "../platform/layout";
import { openStackPage } from "../utils/navigation";
import { Icon, StatPill } from "./ui";
import { BrandLogo } from "./brand/BrandLogo";
import "./AppShell.scss";

/** H5 global top bar — rendered as sibling of tab pages (not wrapping them). */
export function AppHeader() {
  const { copy } = useLocale();
  const credits = useCreditsOptional();
  const [unread, setUnread] = useState(0);
  const routeTick = useRouteTick();
  const immersive = isImmersiveRoute(currentLayoutRoute());

  useEffect(() => {
    syncRootLayoutFromRoute({ showAppHeader: !immersive });
  }, [immersive, routeTick]);

  useEffect(() => {
    if (!isLoggedIn()) return;
    bootstrapAuth();
    vibeApi
      .getNotifications()
      .then((n) => setUnread(n.unread_count))
      .catch(() => {});
  }, [routeTick]);

  if (process.env.TARO_ENV !== "h5" || immersive) return null;

  return (
    <View className="app-shell__header app-shell__header--global">
      <View className="app-shell__brand" onClick={() => Taro.switchTab({ url: "/pages/create/index" })}>
        <BrandLogo variant="icon" size="sm" showName={false} className="app-shell__brand-mark" />
        <Text className="app-shell__logo">{copy.brand.name}</Text>
      </View>
      <View className="app-shell__actions">
        <View className="app-shell__action" onClick={() => openStackPage(STACK_PAGE_ROUTES.search)}>
          <Icon name="search" accent />
        </View>
        <View className="app-shell__action app-shell__action--notify" onClick={() => openStackPage(STACK_PAGE_ROUTES.notifications)}>
          <Icon name="bell" />
          {unread > 0 && (
            <StatPill
              label={unread > 99 ? "99+" : String(unread)}
              variant="danger"
              className="app-shell__notify-pill"
            />
          )}
        </View>
        {credits?.balance != null && (
          <StatPill
            label={copy.appShellUi.credits.replace("{n}", String(credits.balance))}
            onClick={() => openStackPage(STACK_PAGE_ROUTES.pricing)}
          />
        )}
      </View>
    </View>
  );
}
