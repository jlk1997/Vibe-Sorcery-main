import Taro from "@tarojs/taro";
import { vibeApi } from "../services/api";

export type PaymentChannel = "wechat" | "alipay" | "stripe";

/** Apple 支付最低金额：1 元 = 100 分 */
export const IOS_MIN_AMOUNT_FEN = 100;

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

export function getWeappPlatform(): string {
  try {
    return (Taro.getSystemInfoSync().platform || "").toLowerCase();
  } catch {
    return "";
  }
}

export function isWeappIos(): boolean {
  return process.env.TARO_ENV === "weapp" && getWeappPlatform() === "ios";
}

/** iOS 虚拟支付（Apple）不支持低于 1 元的商品。 */
export function isBelowIosMinPrice(amountFen: number | undefined | null): boolean {
  if (amountFen == null || Number.isNaN(Number(amountFen))) return false;
  return Number(amountFen) < IOS_MIN_AMOUNT_FEN;
}

type PayOpts = {
  acceptedPaymentTermsVersion?: string;
  /** 商品金额（分），用于 iOS 最低 1 元校验 */
  amountFen?: number;
};

/** 微信虚拟支付（小程序）：合规要求虚拟商品全终端走 wx.requestVirtualPayment（iOS 由平台路由至 Apple 支付）。 */
async function payWithVirtualPayment(productId: string, opts: PayOpts = {}) {
  const platform = getWeappPlatform();
  const onIos = platform === "ios";

  if (onIos && isBelowIosMinPrice(opts.amountFen)) {
    throw new Error("iOS 最低支付金额为 1 元，请选择其他额度包");
  }
  // 已知测试价商品兜底（调用方未传 amountFen 时）
  if (onIos && productId === "pack_10" && opts.amountFen == null) {
    throw new Error("iOS 最低支付金额为 1 元，请选择其他额度包");
  }

  const { code } = await Taro.login();
  if (!code) throw new Error("登录凭证获取失败，请重试");

  // platform 仅作服务端日志，不进入 signData（官方已废弃该字段）
  const res = await vibeApi.createVirtualPayment(
    productId,
    code,
    platform === "windows" ? "windows" : platform === "ios" ? "ios" : "android",
    opts.acceptedPaymentTermsVersion,
  );

  if (res.mode === "mock") {
    return { mode: "mock" as const, balance: res.balance };
  }

  if (!res.vpay) throw new Error("Unsupported payment response");

  // Apple 支付不支持沙箱，仅现网 env=0
  if (onIos && res.env === 1) {
    throw new Error("iOS 仅支持现网虚拟支付，请将服务端 WECHAT_VPAY_ENV 设为 0 后重试");
  }

  const wxApi = Taro as typeof Taro & {
    requestVirtualPayment?: (opts: {
      signData: string;
      paySig: string;
      signature: string;
      mode: string;
      success?: () => void;
      fail?: (err: unknown) => void;
    }) => void;
  };
  if (typeof wxApi.requestVirtualPayment !== "function") {
    throw new Error(
      onIos
        ? "当前微信版本过低，请升级至微信 8.0.68 及以上后再支付"
        : "当前环境不支持虚拟支付（开发者工具无法调起，请用真机测试）",
    );
  }

  await new Promise<void>((resolve, reject) => {
    wxApi.requestVirtualPayment!({
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
  amountFen?: number,
) {
  if (process.env.TARO_ENV === "weapp") {
    return await payWithVirtualPayment(productId, {
      acceptedPaymentTermsVersion,
      amountFen,
    });
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
