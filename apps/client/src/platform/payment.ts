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

/** 微信虚拟支付（小程序）：合规要求虚拟商品必须走 wx.requestVirtualPayment。 */
async function payWithVirtualPayment(productId: string, acceptedPaymentTermsVersion?: string) {
  const sys = Taro.getSystemInfoSync();
  const platform = (sys.platform || "").toLowerCase();

  // iOS 端虚拟支付有独立开通/适配流程，本期先支持 Android / Windows。
  // 具体提示文案由调用方按当前语言弹出。
  if (platform === "ios") {
    return { mode: "unsupported" as const };
  }

  const { code } = await Taro.login();
  if (!code) throw new Error("no code");

  const res = await vibeApi.createVirtualPayment(
    productId,
    code,
    platform === "windows" ? "windows" : "android",
    acceptedPaymentTermsVersion,
  );

  if (res.mode === "mock") {
    return { mode: "mock" as const, balance: res.balance };
  }

  if (!res.vpay) throw new Error("Unsupported payment response");

  const wx = Taro as typeof Taro & {
    requestVirtualPayment?: (opts: {
      signData: string;
      paySig: string;
      signature: string;
      mode: string;
      success?: () => void;
      fail?: (err: unknown) => void;
    }) => void;
  };
  if (typeof wx.requestVirtualPayment !== "function") {
    throw new Error("当前微信版本不支持虚拟支付，请升级微信");
  }

  await new Promise<void>((resolve, reject) => {
    wx.requestVirtualPayment!({
      signData: res.vpay!.signData,
      paySig: res.vpay!.paySig,
      signature: res.vpay!.signature,
      mode: res.vpay!.mode,
      success: () => resolve(),
      fail: (err) => reject(err),
    });
  });

  return { mode: "paid" as const, outTradeNo: res.out_trade_no };
}

export async function payProduct(
  productId: string,
  channel: PaymentChannel = process.env.TARO_ENV === "weapp" ? "wechat" : "stripe",
  acceptedPaymentTermsVersion?: string,
) {
  if (process.env.TARO_ENV === "weapp") {
    return await payWithVirtualPayment(productId, acceptedPaymentTermsVersion);
  }

  const scene = sceneFor(channel);
  const res = await vibeApi.createPayment(productId, channel, scene, acceptedPaymentTermsVersion);

  if (res.mode === "mock") {
    return { mode: "mock" as const, balance: res.balance, subscription: res.subscription, creditsGranted: res.credits_granted };
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
