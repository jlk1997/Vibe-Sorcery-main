import Taro from "@tarojs/taro";
import { vibeApi } from "../services/api";

export type PaymentChannel = "wechat" | "alipay" | "stripe";

function isMobileH5() {
  if (process.env.TARO_ENV !== "h5" || typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function sceneFor(channel: PaymentChannel) {
  if (process.env.TARO_ENV === "weapp") return "jsapi";
  if (channel === "stripe") return "checkout";
  if (channel === "wechat") return isMobileH5() ? "h5" : "native";
  return isMobileH5() ? "h5" : "web";
}

export async function payProduct(
  productId: string,
  channel: PaymentChannel = process.env.TARO_ENV === "weapp" ? "wechat" : "stripe",
  acceptedPaymentTermsVersion?: string,
) {
  const scene = sceneFor(channel);
  const res = await vibeApi.createPayment(productId, channel, scene, acceptedPaymentTermsVersion);

  if (res.mode === "mock") {
    return { mode: "mock" as const, balance: res.balance, subscription: res.subscription, creditsGranted: res.credits_granted };
  }

  if (process.env.TARO_ENV === "weapp" && res.payment) {
    await Taro.requestPayment({
      timeStamp: res.payment.timeStamp,
      nonceStr: res.payment.nonceStr,
      package: res.payment.package,
      signType: res.payment.signType as "MD5",
      paySign: res.payment.paySign,
    });
    return { mode: "paid" as const, outTradeNo: res.out_trade_no };
  }

  if (process.env.TARO_ENV === "h5") {
    if (res.pay_url) {
      window.location.href = res.pay_url;
      return { mode: "redirect" as const };
    }
    if (res.url) {
      window.location.href = res.url;
      return { mode: "redirect" as const };
    }
    if (res.code_url && res.out_trade_no) {
      return { mode: "qr" as const, codeUrl: res.code_url, outTradeNo: res.out_trade_no };
    }
  }

  throw new Error("Unsupported payment response");
}
