# 微信小程序隐私配置指引

上线前请在 [微信公众平台](https://mp.weixin.qq.com/) 完成以下配置，并与 `docs/legal/zh/privacy-policy.md` 保持一致。

## 1. 用户隐私保护指引

路径：**设置 → 服务内容声明 → 用户隐私保护指引**

需声明收集的用户信息类型：

| 信息类型 | 用途 |
|---------|------|
| 微信 OpenID | 小程序登录、身份识别 |
| 昵称、头像 | 个人资料展示（用户主动填写） |
| 相册/文件 | 上传音频用于创作分析（用户主动授权） |
| 麦克风 | 录音创作（如启用） |
| 订单信息 | 微信支付 |

第三方 SDK：

- 微信开放平台（登录、支付）
- MiniMax AI（音乐生成，传输创作意图与音频特征）

## 2. 代码侧配置

- `apps/client/project.config.json` 已设置 `"__usePrivacyCheck__": true`
- 登录前调用 `wx.requirePrivacyAuthorize`（见 `WechatPrivacyGate.tsx`）

## 3. 审核材料

- 上传《隐私政策》链接或截图（H5 页面 `/packageLegal/pages/privacy/index`）
- 上传《用户服务协议》
- 上传《AI 生成服务声明》（深度合成类目可能需要）

## 4. 类目建议

根据实际功能选择合适类目，可能涉及：

- 文娱 / 音乐
- 工具 / AI 相关（以平台审核为准）

## 5. 客服联系方式

确保与协议中一致：

- 邮箱：privacy@vibe-sorcery.com
- 电话：400-000-0000（上线前替换为真实号码）
