import { PropsWithChildren, ReactNode, useEffect, type CSSProperties } from "react";
import { View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { useCreditsOptional } from "../contexts/CreditsProvider";
import { useLayoutVars } from "../contexts/LayoutVarsProvider";
import { LAYOUT, layoutLength } from "../platform/layout";
import { clsx } from "../utils/clsx";
import { STACK_PAGE_ROUTES } from "../constants/routes";
import { syncNavTitle } from "../utils/syncNavTitle";
import { AtmosphereLayer, PageHeader, StatPill } from "./ui";
import { MiniPlayerBar } from "./player/MiniPlayerBar";
import "./PageShell.scss";

type Props = PropsWithChildren<{
  title: string;
  subtitle?: string;
  label?: string;
  badge?: string;
  showCredits?: boolean;
  wide?: boolean;
  immersive?: boolean;
  ambient?: boolean;
  ambientVariant?: "default" | "warm" | "cool";
  hideHeader?: boolean;
  tabVariant?: boolean;
  actions?: ReactNode;
  noPadTop?: boolean;
}>;

export function PageShell({
  title,
  subtitle,
  label,
  badge,
  showCredits = true,
  wide,
  immersive,
  ambient,
  ambientVariant = "default",
  hideHeader,
  tabVariant,
  actions,
  noPadTop,
  children,
}: Props) {
  const credits = useCreditsOptional();
  const { miniPlayerVisible } = useLayoutVars();
  const { copy, locale } = useLocale();

  // weapp 上，app.tsx 里的 .app-layout-root 包裹层不会真正包住各页面的 WXML，
  // 所以在那里设置的 --mini-player-height 无法传到页面内的底部弹窗（BottomSheet）。
  // 这里在页面级的 .page-shell 上重新注入迷你条高度，保证充值弹窗等能给迷你条留出空间。
  const pageShellStyle =
    process.env.TARO_ENV === "weapp"
      ? ({
          "--mini-player-height": miniPlayerVisible
            ? layoutLength(LAYOUT.miniPlayer)
            : layoutLength(0),
        } as CSSProperties)
      : undefined;
  const displayBadge =
    badge ??
    (showCredits && credits?.balance != null
      ? copy.settingsUi.creditsBalance.replace("{n}", String(credits.balance))
      : undefined);

  const lowCredits = credits?.balance != null && credits.balance < 5 && !credits.isMember;
  const pillVariant = lowCredits ? "danger" : "accent";
  const pillPulse = credits?.balance != null && credits.balance < 3 && !credits.isMember;

  useDidShow(() => syncNavTitle(title));
  useEffect(() => syncNavTitle(title), [title, locale]);

  const headerActions = (
    <>
      {actions}
      {displayBadge && (
        <StatPill
          label={displayBadge}
          variant={pillVariant}
          pulse={pillPulse}
          className={credits?.isMember ? "ui-stat-pill--member" : undefined}
          onClick={() => Taro.navigateTo({ url: STACK_PAGE_ROUTES.pricing })}
        />
      )}
    </>
  );

  return (
    <View
      className={clsx(
        "page-shell",
        wide && "page-shell--wide",
        noPadTop && "page-shell--no-pad-top",
        ambient && "page-shell--ambient"
      )}
      style={pageShellStyle}
    >
      {ambient && <AtmosphereLayer variant={ambientVariant} />}
      {!hideHeader && (
        <PageHeader
          title={title}
          subtitle={subtitle}
          label={label}
          immersive={immersive}
          variant={tabVariant ? "tab" : "stack"}
          actions={headerActions}
        />
      )}
      <View className="page-shell__content">{children}</View>
      <MiniPlayerBar />
    </View>
  );
}

export { SectionLabel } from "./ui/SectionLabel";
