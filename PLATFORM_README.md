# 炼金音坊平台开发者指南

SaaS 平台（FastAPI + Celery + Taro H5/小程序）开发与部署说明。论文 CLI 见根目录 `README.md`。

## 快速启动

```bash
# 基础设施
docker compose up -d postgres redis minio

# API + Worker + Beat（订阅续费 Cron）
docker compose up api worker beat

# 或本地脚本
.\scripts\run-api.ps1
npm run dev:worker
npm run dev:beat
```

## 核心模块

| 模块 | 路径 |
|------|------|
| 额度门控 | `backend/app/services/generation_gate.py` |
| Copilot Studio Bridge | `backend/app/copilot/actions.py`, `apps/client/src/utils/studioBridge.ts` |
| 激活漏斗 | `backend/app/services/analytics.py`, Admin → 激活漏斗 |
| Redis 限流 | `backend/app/services/redis_rate_limit.py` |
| 可观测性 | `/metrics`, `SENTRY_DSN` |

## 验证清单

- 额度系统：见 [docs/CREDITS_VERIFICATION.md](docs/CREDITS_VERIFICATION.md)
- E2E：`npm run test:e2e:full`
- 后端测试：`pytest backend/tests -q`

## 文档

- [PLATFORM.md](PLATFORM.md) — 架构单一事实来源
- [docs/OPEN_API.md](docs/OPEN_API.md) — 对外 API
- [docs/MINIPROGRAM_PARITY.md](docs/MINIPROGRAM_PARITY.md) — 小程序 parity
