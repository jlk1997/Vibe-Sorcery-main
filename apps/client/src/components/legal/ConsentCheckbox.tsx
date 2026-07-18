import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import "./ConsentCheckbox.scss";

type Link = { label: string; route: string };

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  links?: Link[];
  children: React.ReactNode;
};

export function ConsentCheckbox({ checked, onChange, links = [], children }: Props) {
  function open(route: string, e: { stopPropagation: () => void }) {
    e.stopPropagation();
    Taro.navigateTo({ url: route }).catch(() => {});
  }

  return (
    <View className="consent-checkbox" onClick={() => onChange(!checked)}>
      <View className={`consent-checkbox__box ${checked ? "consent-checkbox__box--on" : ""}`}>
        {checked ? <Text className="consent-checkbox__tick">✓</Text> : null}
      </View>
      <Text className="consent-checkbox__text">
        {children}
        {links.map((link) => (
          <Text
            key={link.route}
            className="consent-checkbox__link"
            onClick={(e) => open(link.route, e)}
          >
            {link.label}
          </Text>
        ))}
      </Text>
    </View>
  );
}
