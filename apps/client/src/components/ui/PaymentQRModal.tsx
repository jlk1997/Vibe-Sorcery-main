import { useEffect, useRef, useState } from "react";

import { View, Text, Image } from "@tarojs/components";

import { useLocale } from "@vibe-sorcery/i18n";

import { vibeApi } from "../../services/api";

import { generateQrDataUrl } from "../../utils/generateQrDataUrl";

import { Button } from "./Button";

import "./PaymentQRModal.scss";

type Props = {
  codeUrl: string;
  label: string;
  outTradeNo?: string;
  onClose: () => void;
  onPaid?: () => void;
};

export function PaymentQRModal({ codeUrl, label, outTradeNo, onClose, onPaid }: Props) {
  const { copy } = useLocale();
  const q = copy.paymentQrUi;
  const polling = useRef(false);
  const [qrSrc, setQrSrc] = useState("");

  useEffect(() => {
    if (process.env.TARO_ENV !== "h5") return;
    let cancelled = false;
    generateQrDataUrl(codeUrl, 200).then((url) => {
      if (!cancelled && url) setQrSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [codeUrl]);

  useEffect(() => {
    if (!outTradeNo || polling.current) return;
    polling.current = true;
    let attempts = 0;
    const maxAttempts = 60;
    const timer = setInterval(async () => {
      attempts += 1;
      try {
        const res = await vibeApi.getPaymentOrderStatus(outTradeNo);
        if (res.status === "paid") {
          clearInterval(timer);
          onPaid?.();
        } else if (attempts >= maxAttempts) {
          clearInterval(timer);
        }
      } catch {
        if (attempts >= maxAttempts) clearInterval(timer);
      }
    }, 2000);
    return () => {
      clearInterval(timer);
      polling.current = false;
    };
  }, [outTradeNo, onPaid]);

  return (
    <View className="payment-qr" onClick={onClose}>
      <View className="payment-qr__sheet" onClick={(e) => e.stopPropagation()}>
        <Text className="payment-qr__title">{q.title}</Text>
        <Text className="payment-qr__label">{label}</Text>
        {process.env.TARO_ENV === "h5" ? (
          qrSrc ? (
            <Image className="payment-qr__img" src={qrSrc} mode="aspectFit" />
          ) : (
            <Text className="typo-meta">{q.hint}</Text>
          )
        ) : (
          <Text className="typo-meta">{q.h5Only}</Text>
        )}
        <Text className="payment-qr__hint">{outTradeNo ? q.polling : q.hint}</Text>
        <View className="payment-qr__actions">
          <Button variant="primary" size="sm" onClick={onPaid}>
            {q.paid}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {copy.actions.cancel}
          </Button>
        </View>
      </View>
    </View>
  );
}
