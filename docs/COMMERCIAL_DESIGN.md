# 炼金音坊商业化设计（Commercial Design）

> 版本：2026-07-08 · 与 `docs/legal/zh/payment-terms.md` 及后端 `/billing/*` API 对齐

## 1. 商业模型概览

炼金音坊采用 **Freemium + 额度包 + 会员订阅** 三层结构，面向中国大陆 H5 与微信小程序统一账号体系。

| 层级 | 产品 | 定价（CNY） | 目标用户 |
|------|------|-------------|----------|
| 免费 | 注册赠送 + 签到/任务/邀请 | ¥0 | 体验与拉新 |
| 额度包 | pack_10 / pack_50 / pack_100 | ¥6.8 / ¥28 / ¥48 | 低频付费 |
| 会员月卡 | sub_monthly | ¥29/月 | 高频创作者 |

国际用户（Stripe）以 USD 标价，与 CNY 档位对应，由 `backend/app/services/billing.py` 中的 `CREDIT_PACKS` / `SUBSCRIPTION_PLANS` 维护。

## 2. 额度经济

### 消耗规则

| 操作 | 额度 |
|------|------|
| 单曲生成 | 1 |
| Remix / 翻唱 | 1 |
| 心情转换歌单 | 3 |
| 旅程规划 | 免费 |

### 免费获取

- 注册欢迎额度：15（`WELCOME_CREDITS`）
- 每日签到：1
- 任务奖励：首发、Remix、挑战等
- 邀请裂变：双方各 5

### 增值 SKU

- **决斗季卡** `duel_season_pass`：¥12，含 10 次免费发起情绪决斗（不走创作额度）

### 互动驱动付费

1. **优先队列** — Celery `priority` 队列（`job_dispatch.py`）
2. **专属风格预设** — `member_only` 预设门控
3. **每月 30 额度** — 开通及 Stripe 续费自动发放
4. **会员标识** — 个人主页与 UI 徽章

## 3. 支付渠道

| 渠道 | 场景 | 实现 |
|------|------|------|
| 微信支付 | 小程序 JSAPI、H5 扫码/MWEB | `wechat.py` API v2 |
| 支付宝 | H5/PC 网站支付 | `alipay.py` RSA2 |
| Stripe | 国际信用卡 + 订阅 | Checkout Session + Webhook |

统一入口：`POST /billing/pay`（需 `accepted_payment_terms_version`）

### 合规要点

- 所有支付入口校验付费协议版本（`require_payment_terms`）
- 支付同意写入 `user_consent_logs`（`consent_type=payment_terms`）
- 订单表记录 `payment_terms_version` 与 `expires_at`（2 小时 TTL）
- Celery 每小时清理过期 pending 订单

## 4. 订阅生命周期

```
开通 → active → [Stripe 自动续费 | CN 手动续费/模拟 cron]
                ↓
         cancel_at_period_end → 周期末 inactive
```

### API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/billing/subscription` | 当前会员状态 |
| POST | `/billing/subscription/cancel` | 预约取消（`immediate=false` 默认） |
| GET | `/billing/portal` | Stripe Customer Portal（发票/支付方式） |
| POST | `/billing/subscribe` | 开通会员 |

### 中国区说明

微信/支付宝当前为 **一次性购买**，非原生周期扣款。会员到期前 3 天推送提醒（`subscription_expiry_reminder_task`），用户需在定价页手动续费。法律文案与产品 UI 已明确「到期前手动续费」。

Stripe 用户走原生订阅 + Customer Portal 自助管理。

## 5. 前端触点

| 页面/组件 | 商业化能力 |
|-----------|------------|
| `/pages/pricing/index` | 对比表、价值主张、FAQ、会员管理、订单历史 |
| `CreditsPaywallSheet` | 402 拦截、付费协议勾选、H5 三渠道 |
| `SubscriptionManageCard` | 取消续费、Stripe Portal |
| `EngagementPanel` | 免费额度获取 |
| Settings | 跳转定价、支付回调 toast |

## 6. 运营与监控

- **Admin**：`GET /admin/commercial` — 30 日营收、渠道分布
- **Analytics 事件**：`payment_start`, `payment_success`, `paywall_view`, `subscription_purchase`
- **Celery Beat**：
  - `renew_subscriptions_task` — 模拟/CN 续期
  - `subscription_expiry_reminder_task` — 到期提醒
  - `expire_stale_payment_orders_task` — 订单过期
  - `deactivate_expired_subscriptions_task` — 取消预约到期

## 7. 上线配置清单

```env
# Stripe（国际）
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_SUBSCRIPTION_PRICE_ID=

# 微信支付
WECHAT_APP_ID=
WECHAT_PAY_MCH_ID=
WECHAT_PAY_API_KEY=

# 支付宝
ALIPAY_APP_ID=
ALIPAY_PRIVATE_KEY=
ALIPAY_PUBLIC_KEY=

# 公网回调
API_PUBLIC_URL=https://your-domain/api/v1
FRONTEND_BASE_URL=https://your-domain
```

生产环境 `DEBUG=false` 时 mock 支付不可用，必须配置至少一个真实渠道。

## 7. 安全与性能

### 安全

| 措施 | 说明 |
|------|------|
| 登录限流 | 15 次/分钟/IP + 10 次/分钟/账号 |
| 支付限流 | 10 次/分钟/用户 |
| Webhook 限流 | 120 次/分钟/IP |
| CN 回调校验 | 金额、appid/mch_id 与订单一致 |
| 订单状态 | 仅 `pending` 且未过期可履约 |
| Stripe | HMAC 验签 + event ID 去重（Redis 7 天） |
| 生产配置 | `RATE_LIMIT_FAIL_CLOSED=true`（Redis 不可用时拒绝而非放行） |

### 性能

| 措施 | 说明 |
|------|------|
| Redis 缓存 | `/billing/packs|plans|methods` TTL 300s |
| 法律文档缓存 | `/legal/*` TTL 3600s + `Cache-Control` |
| DB 索引 | `(status, expires_at)`、`(user_id, created_at)` |
| 运营统计 | `commercial_stats` 使用 SQL 聚合而非全表加载 |

## 8. 路线图（P1+）

- [ ] 微信委托代扣 / 支付宝周期扣款（CN 原生续费）— `GET /billing/cn-recurring/status` 已暴露状态，待接入
- [x] 多档会员 — **年卡 `sub_yearly`** + **Pro 商用 `sub_pro_commercial`** + **团队 `sub_team`** + **API Starter `sub_api_starter`**
- [x] 应用内电子发票申请 — `POST /ecosystem/invoices`
- [ ] Stripe Refund API 与客服工单联动
- [x] MRR / 流失 / LTV 运营看板基础指标 — `commercial_stats` 增强
- [x] **情绪日历** — 自动月度专辑歌单 `playlist_id` + 情绪日志
- [x] **公开歌单订阅** — `POST/DELETE /playlists/{id}/subscribe`，库页「我订阅的歌单」
- [x] **周任务奖励钩子** — 发布/Remix/旅程/社区试听（`community_listen` ×3）
- [x] **轻量打磨** — `GET /studio/works/{id}/refine-hints` + 创作页 BPM/Key 预填
- [x] **微信订阅消息** — `WECHAT_TPL_*` 环境变量 + `/config/platform.wechat_subscribe`
- [x] **真实 LRC 歌词轴** — `lyrics_timeline.py` 解析 `[mm:ss]` 与 embedded timeline
- [x] **作品质量评分** — `GET /works/{id}/quality` + 生成后 `WorkQualityCard`
- [x] **情绪 MV 预览** — `GET /studio/works/{id}/mood-visual` 幻灯片 manifest
- [x] **AI 封面额度** — 会员每月 3 次免费，超出 1 额度
- [x] **客服工单 + Stripe 退款** — `POST /ecosystem/support-tickets`，管理员 resolve + 可选 Stripe refund
- [x] **CN 原生续费候补** — `POST /billing/cn-recurring/waitlist`

## 9. 留存与生态触点（Phase D）

| 能力 | API / 组件 |
|------|------------|
| 情绪日历 | `GET/POST /users/me/emotion-calendar`，`monthly` 含 `playlist_id` |
| 配方/曲包市场 | `/pages/marketplace`，`ecosystem/templates` + `work-packs` |
| 创作者商店 | 用户主页曲包区 `listUserWorkPacks` |
| Copilot 限额 | 非会员 10 次/日，会员 Copilot Pro 徽章 |
| 周任务 | `EngagementPanel` + `on_engagement_event` |
| API 用量 | 设置页 `GET /users/me/api-usage` |
