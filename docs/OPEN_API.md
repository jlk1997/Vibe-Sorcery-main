# Open API（B2B 嵌入）

Base URL: `{API_PUBLIC_URL}`（默认 `http://localhost:8000/api/v1`）

## 认证

- **用户 JWT**：`Authorization: Bearer <token>`（注册/登录获取）
- **API Key**：`X-API-Key: <key>`（用户设置页创建，支持 scope 与限流）

## 核心端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/works/generate/single` | 单曲生成（402 额度不足） |
| POST | `/works/generate/playlist` | 歌单/旅程生成 |
| GET | `/jobs/{id}` | 任务状态与进度 |
| POST | `/jobs/{id}/cancel` | 取消任务（revoke worker + 退款） |
| GET | `/users/me/credits` | 余额 |
| POST | `/copilot/chat` | Copilot（返回 `actions: StudioAction[]`） |
| GET | `/challenges/{slug}/leaderboard` | 挑战排行榜 |

## StudioAction 协议

Copilot 响应 `actions` 字段，前端通过 `applyStudioActions()` 预填 Create/Journey：

```json
{
  "type": "prefill_create",
  "mode": "playlist",
  "payload": { "text_intent": "...", "preset_id": "lo-fi-night" }
}
```

## Webhook

用户可注册 `POST /users/me/webhooks`，在任务 `completed` / `failed` / `cancelled` 时回调。

## 限流

API Key 默认 120 req/min（Redis 滑动窗口，多副本一致）。

OpenAPI 完整 schema：`GET /openapi.json` 或 `npm run sync:openapi`。

嵌入播放器 SDK 见 [EMBED_SDK.md](./EMBED_SDK.md)。
