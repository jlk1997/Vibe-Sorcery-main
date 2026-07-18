import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { STACK_PAGE_ROUTES } from "../../constants/routes";
import { useLocale } from "@vibe-sorcery/i18n";
import { Button } from "./Button";
import "./ui.scss";

type Props = {
  message?: string;
  loginLabel?: string;
};

export function AuthBanner({ message, loginLabel }: Props) {
  const { copy } = useLocale();
  const text = message ?? copy.settingsUi.authBanner;
  const label = loginLabel ?? copy.loginUi.login;

  return (
    <View className="ui-auth-banner">
      <Text className="ui-auth-banner__text">{text}</Text>
      <Button size="sm" variant="primary" onClick={() => Taro.navigateTo({ url: STACK_PAGE_ROUTES.login })}>
        {label}
      </Button>
    </View>
  );
}
