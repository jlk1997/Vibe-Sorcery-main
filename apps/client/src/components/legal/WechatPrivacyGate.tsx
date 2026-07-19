import { View } from "@tarojs/components";

import Taro from "@tarojs/taro";



type Props = {

  children: React.ReactNode;

};



/**

 * 纯透传容器。

 *

 * 合规要求：小程序打开进入首页时，不得在用户体验任何功能前就要求授权。

 * 因此这里不再在挂载时主动调用 wx.requirePrivacyAuthorize，隐私授权改为在

 * 真正需要登录的动作里（见 requireWechatPrivacyAuthorize，被 loginWithWechat 调用）才触发。

 */

export function WechatPrivacyGate({ children }: Props) {

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

