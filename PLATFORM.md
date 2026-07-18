# Vibe Sorcery Platform 2.0

完整 Windows 启动说明见 **[START-WINDOWS.md](START-WINDOWS.md)**。

## 架构

```
apps/client/  ← 唯一维护中的用户端（Taro H5 + 微信小程序）
         ↓ packages/api-client, packages/i18n, packages/types
backend/ (FastAPI + Celery)
         ↓
Essentia EmotionEngine + MiniMax Music 2.6 + MiniMax-M3
         ↓
PostgreSQL + Redis + MinIO
```

**用户端策略（2026-07）：** 只深耕 `apps/client`（Taro H5 + 微信小程序）。历史 Expo 原生原型与废弃小程序副本已移除，唯一前端源码为 `apps/client/`。

## 产品规划文档（v5）

| 文档 | 用途 |
|------|------|
| [PRODUCT_ROADMAP_v5.md](PRODUCT_ROADMAP_v5.md) | 战略、五层栈、12 周排期 |
| [PRODUCT_SPEC_COMPLETE.md](PRODUCT_SPEC_COMPLETE.md) | 全功能矩阵、模块规格、验收 |
| [PRODUCT_IMPLEMENTATION_BLUEPRINT.md](PRODUCT_IMPLEMENTATION_BLUEPRINT.md) | 81 项 ticket、权限/状态机/迁移/商业化 |
| [PRODUCT_UX_DESIGN_SYSTEM.md](PRODUCT_UX_DESIGN_SYSTEM.md) | 完整 UX 设计规范与体验蓝图 |
| [PRODUCT_INTENT_FIRST_ARCHITECTURE.md](PRODUCT_INTENT_FIRST_ARCHITECTURE.md) | 意图优先：降低门槛、seed 可选、prompt_journey |

## 快速启动 (Docker)

```bash
cp .env.example .env
# 填入 MINIMAX_API_KEY (https://platform.minimaxi.com/subscribe/token-plan)

docker compose up -d postgres redis minio
docker compose up api worker frontend
```

- Web H5: http://localhost:3000 （Docker） / http://localhost:10086 （`npm run dev:web`）
- API: http://localhost:8000/docs
- MinIO Console: http://localhost:9001

## 本地 CLI (原版 pipeline)

```bash
pip install -r requirements.txt
# 下载 Essentia 模型到 models/
python main.py -o playlist -n 6 -d 47.0
```

## 用户端开发（Taro）

| 命令 | 说明 |
|------|------|
| `npm run dev:web` | H5 开发（http://localhost:10086） |
| `npm run dev:mp` | 微信小程序，导入 `apps/client/dist` |
| `npm run build:web` | 生产 H5 → `apps/client/dist-h5/` |
| `npm run build:mp` | 小程序包 → `apps/client/dist/` |
| `npm run lint:tokens` | 设计 token 校验 |

详见 [docs/UNIFIED_TARO_CLIENT.md](docs/UNIFIED_TARO_CLIENT.md)。

## 核心模块

| 模块 | 路径 |
|------|------|
| 情绪引擎 | `backend/app/core/emotion_engine.py` |
| Playlist 编排 | `backend/app/core/playlist_orchestrator.py` |
| MiniMax 集成 | `backend/app/integrations/minimax/` |
| 溯源 API | `backend/app/api/routes/provenance.py` |
| 社区 API | `backend/app/api/routes/community.py` |
| 共享 SDK | `packages/api-client` |

## SaaS 扩展

见 [deploy/SAAS.md](deploy/SAAS.md) 与 [deploy/k8s/](deploy/k8s/)。

## 论文引用

Urrego-Gómez, I., Colton, S., & Roman, I. R. (2025). *Vibe Sorcery: Integrating Emotion Recognition with Generative Music for Playlist Curation*. LLM4MA Workshop.
