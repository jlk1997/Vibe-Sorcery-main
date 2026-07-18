# 小程序 Parity 清单

与 H5 核心路径对齐状态（v3.0 路线图 Phase 2）。

## 已对齐

- 创作四模式 + Remix 流程
- 发现 Feed / 挑战详情 / 排行榜
- 社区榜单（charts）/ 情绪决斗（duels）
- 听完情绪打卡 / 今日心情电台
- 评论敏感词审核 / 删除自己的评论
- 额度展示与 402 Paywall（微信支付）
- Copilot → Studio Bridge（storage handoff）
- 签到与任务奖励

## 待补齐（运营/管理向）

| 能力 | H5 | 小程序 | 备注 |
|------|----|--------|------|
| Admin 后台 | ✅ | ❌ | 仅 H5 |
| 溯源 C2PA 导出 | ✅ | 部分 | 下载受限 |
| 嵌入播放器 SDK | ✅ | N/A | B2B H5 |
| Stripe 订阅 | ✅ | ❌ | 小程序走微信支付 |

## 开发注意

- 构建：`npm run build:mp`，API 通过 `TARO_APP_API_URL` 注入
- 支付回跳：定价页需处理 `scene` 与 `referrerInfo`
- 详见 [UNIFIED_TARO_CLIENT.md](UNIFIED_TARO_CLIENT.md)
