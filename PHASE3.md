# Phase 3 完整落地文档

版本：`vibe-sorcery/3.0.0`

## 已实现功能

### 1. 规模化部署
- **K8s 完整清单**：[`deploy/k8s/`](deploy/k8s/)
  - API/Worker Deployment + HPA
  - Ingress + TLS + Frontend Deployment
  - PostgreSQL StatefulSet
  - ConfigMap / Secret（OSS/CDN/MiniMax 配置）
- **CDN/OSS**：`CDN_BASE_URL` 环境变量，HLS/封面 URL 自动走 CDN

### 2. HLS 流式播放
- [`backend/app/services/media.py`](backend/app/services/media.py) — FFmpeg 转 HLS
- 生成完成后自动触发 `post_process_work_task`
- Work 模型新增 `hls_url`, `hls_storage_prefix`
- 前端 `AudioPlayer` 优先使用 HLS 源

### 3. Music-Cover + 封面生成
- [`backend/app/integrations/minimax/cover.py`](backend/app/integrations/minimax/cover.py) — Music-Cover API
- [`backend/app/integrations/minimax/image.py`](backend/app/integrations/minimax/image.py) — 封面图生成
- API：`POST /api/v1/studio/music-cover`, `POST /api/v1/studio/cover-image`

### 4. C2PA 存证 + 区块链锚定
- [`backend/app/services/c2pa.py`](backend/app/services/c2pa.py)
  - C2PA manifest JSON 生成
  - Sidecar 元数据上传 MinIO
  - 可选 blockchain anchor（`BLOCKCHAIN_ANCHOR_ENABLED=true`）
- ProvenanceRecord 新增 `c2pa_manifest`, `blockchain_tx_hash`
- 导出：`GET /api/v1/provenance/{id}/export?format=vibe`

### 5. 个性化推荐 Feed
- [`backend/app/services/recommendation.py`](backend/app/services/recommendation.py)
- pgvector 情绪嵌入 + 用户偏好 + 关注加权
- Feed 默认 `sort=personalized`

### 6. 话题挑战
- Challenge / ChallengeEntry 模型
- API：`GET/POST /api/v1/challenges`, `POST /api/v1/challenges/{slug}/enter`
- 默认挑战 `#CalmToChaos` 启动时自动 seed
- 前端：[`pages/challenges/index`](apps/client/src/pages/challenges/index.tsx)（Tab「发现」）

### 7. AV 旅程编辑器
- API：`POST /api/v1/studio/journey/custom` — 航点 → 旅程配置
- 前端：[`pages/journey/index`](apps/client/src/pages/journey/index.tsx) — 可拖拽 AV 平面 + 音频锚点

### 8. Admin 后台 + Moderation
- 管理员权限（首个注册用户自动 `is_admin=true`）
- API：stats / usage / reports / flags / seed
- 前端：[`packageOps/pages/admin/index`](apps/client/src/packageOps/pages/admin/index.tsx)（分包）
- 社区举报：`POST /api/v1/community/report`

### 9. 多租户预留
- `tenant_id` 字段：User, Work, Post, Challenge

### 10. 统一 Taro 客户端（H5 + 微信小程序）
- [`apps/client/`](apps/client/) — 唯一 Web / 小程序前端
- 分包：`packageOps`（admin、embed）、`packageCopilot`（AI 助手）
- 复用 `packages/api-client` + `apps/client/src/platform`
- 页面：Feed / Journey / Create / Profile / Works / Challenges 等 20+ 路由

## 环境变量（Phase 3 新增）

```ini
CDN_BASE_URL=https://cdn.example.com
C2PA_ENABLED=true
BLOCKCHAIN_ANCHOR_ENABLED=false
BLOCKCHAIN_RPC_URL=
FFMPEG_PATH=ffmpeg
MINIMAX_IMAGE_MODEL=image-01
MINIMAX_MUSIC_COVER_MODEL=music-cover
```

## 本地验证 Phase 3

```powershell
# 安装 FFmpeg（HLS 转码需要）
winget install Gyan.FFmpeg

# 启动服务（同 START-WINDOWS.md）
.\scripts\start-infra.ps1
# API + Worker + Frontend

# 生成作品后自动 post-process（HLS + 封面 + C2PA）
# 或手动触发：
# POST /api/v1/studio/works/{work_id}/post-process

# 访问新页面（本地 dev:10086 / Docker:3000）
# http://localhost:10086/pages/journey/index
# http://localhost:10086/pages/challenges/index
# http://localhost:10086/packageOps/pages/admin/index
```

## 生产部署

```bash
kubectl apply -f deploy/k8s/config.yaml
kubectl apply -f deploy/k8s/postgres-redis.yaml
kubectl apply -f deploy/k8s/api-worker.yaml
kubectl apply -f deploy/k8s/ingress-frontend.yaml
```

## Feature Flags

| Key | 默认 | 说明 |
|-----|------|------|
| music_cover | ON | Music-Cover API |
| hls_streaming | ON | HLS 转码 |
| c2pa_provenance | ON | C2PA _manifest |
| personalized_feed | ON | 个性化 Feed |
