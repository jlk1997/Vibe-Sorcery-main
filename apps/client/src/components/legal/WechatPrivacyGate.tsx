import { useEffect } from "react";

import { View } from "@tarojs/components";

import Taro from "@tarojs/taro";



type Props = {

  children: React.ReactNode;

};



/** Best-effort privacy authorize on weapp — never blocks rendering (API may hang in devtools). */

export function WechatPrivacyGate({ children }: Props) {

  useEffect(() => {

    if (process.env.TARO_ENV !== "weapp") return;



    const wx = Taro as typeof Taro & {

      requirePrivacyAuthorize?: (opts: { success?: () => void; fail?: () => void }) => void;

      getPrivacySetting?: (opts: {

        success?: (res: { needAuthorization: boolean; privacyContractName: string }) => void;

        fail?: () => void;

      }) => void;

    };



    if (typeof wx.getPrivacySetting !== "function") return;



    wx.getPrivacySetting({

      success(res) {

        if (!res.needAuthorization) return;

        wx.requirePrivacyAuthorize?.({ success: () => {}, fail: () => {} });

      },

      fail: () => {},

    });

  }, []);



  return <View className="wechat-privacy-gate__content">{children}</View>;

}



export async function requireWechatPrivacyAuthorize(): Promise<boolean> {

  if (process.env.TARO_ENV !== "weapp") return true;

  const wx = Taro as typeof Taro & {

    requirePrivacyAuthorize?: (opts: { success?: () => void; fail?: () => void }) => void;

  };

  if (typeof wx.requirePrivacyAuthorize !== "function") return true;

  return new Promise((resolve) => {

    wx.requirePrivacyAuthorize!({

      success: () => resolve(true),

      fail: () => resolve(false),

    });

  });

}

