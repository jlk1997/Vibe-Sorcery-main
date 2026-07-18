# SaaS 扩展预留

## 对象存储迁移 (MinIO → OSS/COS)

`StorageService` 使用 S3 兼容接口。生产环境只需修改 ConfigMap：

- `S3_ENDPOINT`: 阿里云 OSS 或腾讯云 COS endpoint
- `S3_ACCESS_KEY` / `S3_SECRET_KEY`: 云厂商密钥

## CDN + HLS 流

Phase 3 在 `backend/app/services/media.py` 预留转码管道：

1. MiniMax 输出 mp3 → FFmpeg 转 HLS
2. 上传 `.m3u8` + segments 到 OSS
3. CDN 域名指向 bucket

## 小程序 (Taro)

统一客户端位于 **`apps/client/`**（H5 + 微信小程序），复用 `packages/api-client`。

```bash
npm run dev:mp    # 微信开发者工具导入 apps/client/dist
npm run build:web # 静态 H5 -> apps/client/dist-h5
```

旧路径 `deploy/miniprogram/` 已删除；唯一小程序源码为 `apps/client`。

## C2PA 存证

`ProvenanceRecord.signature` 已支持 HMAC 校验。Phase 3 可扩展：

- 将 `content_hash` 写入 Polygon/蚂蚁链
- 使用 `c2pa-python` 嵌入音频元数据

## Music-Cover

MiniMax Music-Cover API 可在 `backend/app/integrations/minimax/cover.py` 接入，用于 Remix 风格迁移。

## 多租户

数据库模型预留 `tenant_id` 扩展点 — 在 SaaS 阶段为 `users`, `works`, `posts` 表添加该字段并实现 Row Level Security。
