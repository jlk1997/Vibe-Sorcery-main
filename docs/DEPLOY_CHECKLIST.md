# Vibe Sorcery 双端发布 Checklist（H5 + 微信小程序）

## 后端 `.env`（生产）

- [ ] `DEBUG=false`
- [ ] `JWT_SECRET` — 32+ 字符强随机
- [ ] `ADMIN_BOOTSTRAP_EMAIL` — 首次 bootstrap 后留空
- [ ] `MINIMAX_API_KEY`
- [ ] `DATABASE_URL` / `REDIS_URL`
- [ ] `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`（若启用 Stripe）
- [ ] `WECHAT_APP_ID` / `WECHAT_APP_SECRET` / 微信支付商户号
- [ ] `FRONTEND_BASE_URL` — H5 站点 origin
- [ ] `S3/CDN` 公网可达（音频、封面、头像）
- [ ] 启动前执行 `alembic upgrade head`

## H5（Taro build:h5）

- [ ] `TARO_APP_API_URL=/api/v1`（同域 Nginx 反代）或完整 API 域名
- [ ] `docker compose up frontend` 验证静态资源与 `/api` 代理
- [ ] Stripe / 支付宝回跳 `settings?checkout=success` 可用

## 微信小程序（Taro build:weapp）

- [ ] 微信公众平台配置 **request 合法域名**（API）
- [ ] **uploadFile 合法域名**（MinIO/CDN）
- [ ] **downloadFile 合法域名**（音频 CDN）
- [ ] **WebSocket 合法域名**（若启用 job WS；否则依赖 poll）
- [ ] `project.config.json` 填写正确 `appid`
- [ ] 真机关闭「不校验合法域名」后完整走通：登录 → 创作 → 播放 → JSAPI 支付
- [ ] 主包体积 < 2MB；`packageStudio` / `packageOps` / `packageCopilot` 分包已配置

## 冒烟测试（E2E 手动）

1. 注册 / 登录（H5 邮箱 + 小程序微信）— **须勾选用户协议与隐私政策**
2. H5 首次打开 — **隐私政策弹窗**
3. 首次 AI 生成 — **AI 服务声明确认**
4. Create 无 seed 生成单曲 → 库 → 发布发现 — **发布合规勾选**
5. Feed 播放 → 作品显示 **「AI 生成」** 标识
6. Remix → 溯源页
7. 关注用户 → 公开主页粉丝列表
8. 额度不足 402 → Pricing 充值（**勾选付费协议**）→ 继续创作
9. 设置 → 导出数据 / 注销账号
10. `GET /health` 返回 `database`/`redis`/`essentia_models` 子状态  
   - 快速检查：`npm run smoke:health`（默认 `http://localhost:8000/api/v1`）  
   - 公开 API：`npm run smoke:api`（health + presets + platform config + legal documents）

## 合规上线（中国大陆 H5 + 微信小程序）

- [ ] `docs/legal/zh/` 六份协议文档已部署且 `GET /legal/documents` 可访问
- [ ] 注册/微信登录勾选用户协议 + 隐私政策
- [ ] H5 首次启动隐私弹窗
- [ ] 首次 AI 生成前 AI 声明确认
- [ ] 付费前勾选付费服务协议
- [ ] 发布前内容合规确认 + 敏感词过滤
- [ ] 全端 AI 生成标识展示
- [ ] 设置页账号注销与数据导出
- [ ] 微信小程序后台隐私指引配置（见 `docs/WECHAT_PRIVACY_SETUP.md`）
- [ ] ICP 备案号展示（H5 页脚，上线时填写真实备案号）
- [ ] 客服邮箱/电话替换为真实联系方式
- [ ] `alembic upgrade head`（含 `0008_legal_consent`、`0009_commercial` 迁移）
- [ ] Celery beat 已启动（含账号注销、订单过期、订阅到期任务）

## 商业化上线

- [ ] 阅读 `docs/COMMERCIAL_DESIGN.md` 并完成支付渠道配置
- [ ] Stripe Webhook 指向 `POST /billing/webhook` 且验签通过
- [ ] 微信/支付宝异步通知 URL 公网可达（`API_PUBLIC_URL`）
- [ ] Paywall 与定价页付费协议勾选联调（402 → 充值成功）
- [ ] 会员开通 / 取消续费 / Stripe Portal 冒烟
- [ ] `GET /billing/subscription` 与订单历史正常
- [ ] Celery：`expire-stale-payment-orders-hourly`、`renew-mock-subscriptions-daily`

## 安全与性能

- [ ] 生产 `.env` 设置 `RATE_LIMIT_FAIL_CLOSED=true`
- [ ] 登录 / 支付 / Webhook 限流联调（429 响应）
- [ ] 微信/支付宝回调金额篡改测试（应拒绝履约）
- [ ] `alembic upgrade head`（含 `0010_payment_indexes`）
- [ ] Redis 可用（缓存 + 限流共用）

## CI 必须通过

- `pytest backend/tests`
- `npm run build:h5` + `npm run build:weapp`
- `npm run smoke:api`（API 启动后）
- `npm run test:e2e`（可选，H5 静态冒烟）
