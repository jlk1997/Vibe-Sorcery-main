import { useEffect, useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { vibeApi } from "../../services/api";
import { requireAuth } from "../../utils/auth";
import { useCreditsOptional } from "../../contexts/CreditsProvider";
import { BottomSheet, Button, ChipGroup, CreditsPaywallSheet, Input } from "../ui";
import "./TipSheet.scss";

const TIP_AMOUNTS = [1, 3, 5] as const;

type Props = {
  open: boolean;
  workId: string;
  workTitle?: string;
  onClose: () => void;
  onDone?: () => void;
};

export function TipSheet({ open, workId, workTitle, onClose, onDone }: Props) {
  const { copy } = useLocale();
  const eco = copy.ecosystemUi;
  const social = copy.socialUi;
  const creditsCtx = useCreditsOptional();
  const [message, setMessage] = useState("");
  const [amount, setAmount] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(1);
      void creditsCtx?.refresh();
    }
  }, [open, creditsCtx]);

  const balance = creditsCtx?.balance ?? 0;

  async function submit() {
    if (!requireAuth()) return;
    if (balance < amount) {
      setPaywallOpen(true);
      return;
    }
    setSubmitting(true);
    try {
      await vibeApi.tipWork(workId, amount, message.trim() || undefined);
      await creditsCtx?.refresh();
      setMessage("");
      Taro.showToast({ title: eco.tipSuccess, icon: "success" });
      onDone?.();
      onClose();
    } catch {
      Taro.showToast({ title: eco.tipFail, icon: "none" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <BottomSheet open={open} title={eco.tipTitle} onClose={onClose}>
        <View className="tip-sheet">
          {workTitle ? <Text className="tip-sheet__work">{workTitle}</Text> : null}
          <Text className="tip-sheet__balance">{eco.tipBalance.replace("{n}", String(balance))}</Text>
          <Text className="tip-sheet__label">{eco.tipAmountLabel}</Text>
          <ChipGroup
            options={TIP_AMOUNTS.map((n) => ({ value: String(n), label: `${n}` }))}
            value={String(amount)}
            onChange={(v) => setAmount(Number(v))}
          />
          <Input
            className="tip-sheet__input"
            placeholder={social.tipThanksPlaceholder}
            value={message}
            onInput={(e) => setMessage(e.detail.value)}
          />
          <Text className="tip-sheet__hint">{eco.tipHint.replace("1", String(amount))}</Text>
          <Button variant="primary" block loading={submitting} onClick={() => void submit()}>
            {eco.tipTitle} · {amount}
          </Button>
          {balance < amount ? (
            <Button variant="ghost" size="sm" block onClick={() => setPaywallOpen(true)}>
              {eco.tipInsufficient}
            </Button>
          ) : null}
        </View>
      </BottomSheet>
      <CreditsPaywallSheet open={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </>
  );
}
