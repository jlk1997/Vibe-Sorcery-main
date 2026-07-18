import { vibeApi } from "../services/api";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll until WeChat/Alipay webhook marks order paid (JSAPI returns before notify). */
export async function pollPaymentUntilPaid(
  outTradeNo: string,
  maxAttempts = 30,
  intervalMs = 2000
): Promise<{ status: string; balance?: number } | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) await sleep(intervalMs);
    try {
      const res = await vibeApi.getPaymentOrderStatus(outTradeNo);
      if (res.status === "paid") return res;
    } catch {
      /* retry */
    }
  }
  return null;
}
