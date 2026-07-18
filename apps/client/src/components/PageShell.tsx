import { PropsWithChildren, ReactNode, useEffect } from "react";
import { View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { useCreditsOptional } from "../contexts/CreditsProvider";
import { clsx } from "../utils/clsx";
import { STACK_PAGE_ROUTES } from "../constants/routes";
import { syncNavTitle } from "../utils/syncNavTitle";
import { AtmosphereLayer, PageHeader, StatPill } from "./ui";
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
  const { copy, locale } = useLocale();
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
    </View>
  );
}

export { SectionLabel } from "./ui/SectionLabel";
