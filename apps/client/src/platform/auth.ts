import Taro from "@tarojs/taro";
import { vibeApi } from "../services/api";
import { saveAuthToken, clearToken } from "../utils/auth";

export async function loginWithEmail(email: string, password: string) {
  const res = await vibeApi.login(email, password);
  saveAuthToken(res.access_token);
  return res;
}

export async function registerWithEmail(
  email: string,
  username: string,
  password: string,
  referralCode?: string,
  acceptedTermsVersion?: string,
  acceptedPrivacyVersion?: string,
) {
  const res = await vibeApi.register(email, username, password, referralCode, acceptedTermsVersion, acceptedPrivacyVersion);
  saveAuthToken(res.access_token);
  return res;
}

export async function loginWithWechat(acceptedTermsVersion?: string, acceptedPrivacyVersion?: string) {
  if (process.env.TARO_ENV !== "weapp") {
    throw new Error("WeChat login is only available in mini-program");
  }
  const { requireWechatPrivacyAuthorize } = await import("../components/legal/WechatPrivacyGate");
  const ok = await requireWechatPrivacyAuthorize();
  if (!ok) throw new Error("privacy not authorized");
  const { code } = await Taro.login();
  if (!code) throw new Error("no code");
  const res = await vibeApi.wechatLogin(code, acceptedTermsVersion, acceptedPrivacyVersion);
  saveAuthToken(res.access_token);
  return res;
}

export function logout() {
  clearToken();
}
