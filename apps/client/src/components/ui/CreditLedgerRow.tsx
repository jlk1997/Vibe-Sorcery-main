import { View, Text } from "@tarojs/components";
import { Icon, type IconName } from "./Icon";
import { clsx } from "../../utils/clsx";
import "./CreditLedgerRow.scss";

type Props = {
  source: string;
  credits: number;
  date?: string;
};

function sourceIcon(source: string): IconName {
  const s = source.toLowerCase();
  if (s.includes("payment") || s.includes("purchase") || s.includes("stripe")) return "bookmark";
  if (s.includes("generat") || s.includes("job")) return "music";
  if (s.includes("refund")) return "stop";
  if (s.includes("bonus") || s.includes("grant")) return "heart";
  return "profile";
}

export function CreditLedgerRow({ source, credits, date }: Props) {
  const positive = credits > 0;

  return (
    <View className="credit-ledger-row">
      <View className={clsx("credit-ledger-row__icon", positive ? "credit-ledger-row__icon--in" : "credit-ledger-row__icon--out")}>
        <Icon name={sourceIcon(source)} size="sm" accent={positive} />
      </View>
      <View className="credit-ledger-row__body">
        <Text className="credit-ledger-row__source">{source}</Text>
        {date && <Text className="credit-ledger-row__date">{date}</Text>}
      </View>
      <Text className={clsx("credit-ledger-row__amount", positive ? "credit-ledger-row__amount--in" : "credit-ledger-row__amount--out")}>
        {positive ? "+" : ""}
        {credits}
      </Text>
    </View>
  );
}
