# MiniMax 模型集成说明

对照官方文档：[MiniMax 模型介绍](https://platform.minimaxi.com/docs/guides/models-intro)

## 系统当前采用的模型

| 能力 | 官方模型 | 系统配置项 | 调用位置 |
|------|---------|-----------|---------|
| **音乐生成**（Playlist / 单曲 / 人声） | `music-2.6` | `MINIMAX_MUSIC_MODEL` | `POST /v1/music_generation` |
| **翻唱 / 风格迁移** | `music-cover` | `MINIMAX_MUSIC_COVER_MODEL` | `POST /v1/music_generation`（一步）或 preprocess + generation（两步） |
| **旅程 / Prompt 工程** | `MiniMax-M3` | `MINIMAX_CHAT_MODEL` | `POST /v1/text/chatcompletion_v2` |
| **结构化歌词** | 歌词生成 API | — | `POST /v1/lyrics_generation`（失败时 M3 兜底） |
| **专辑封面图** | `image-01` | `MINIMAX_IMAGE_MODEL` | `POST /v1/image_generation` |

> **未使用**官方语音模型（Speech-2.8）与视频模型（Hailuo）——当前产品聚焦「情绪音乐生产 + 社区 + 溯源」。

## music-2.6 在 Vibe Sorcery 中的用法

根据 [音乐生成指南](https://platform.minimaxi.com/docs/guides/music-generation)：

1. **纯音乐 Playlist**（默认）：`is_instrumental=true`，M3 生成含 BPM/调性的 prompt
2. **人声单曲**：前端传入 `lyrics` + `instrumental=false`
3. **自动歌词**：`lyrics_optimizer=true`（`.env` 中 `MINIMAX_LYRICS_OPTIMIZER_DEFAULT`）

Pipeline：`EmotionEngine` → `MiniMax-M3` prompt → **`music-2.6`** → MinIO → HLS/C2PA

## music-cover 在 Vibe Sorcery 中的用法

| 模式 | 官方流程 | 系统 API |
|------|---------|---------|
| **一步翻唱** | `audio_url` + `prompt` → `/music_generation` | `POST /studio/music-cover` + `cover_mode=one_step` |
| **两步翻唱** | `/music_cover_preprocess` → 编辑歌词 → `/music_generation` + `cover_feature_id` | `cover_mode=two_step` + 可选 `modified_lyrics` |

## .env 配置示例

```ini
MINIMAX_API_BASE=https://api.minimaxi.com/v1
MINIMAX_MUSIC_MODEL=music-2.6
MINIMAX_MUSIC_COVER_MODEL=music-cover
MINIMAX_CHAT_MODEL=MiniMax-M3
MINIMAX_IMAGE_MODEL=image-01
MINIMAX_COVER_MODE_DEFAULT=one_step
```

国际 Token Plan 用户请将 `MINIMAX_API_BASE` 改为 `https://api.minimax.io/v1`。

## 查看运行时模型

```bash
curl http://localhost:8000/api/v1/config/platform
```

返回 `minimax.music_model`、`minimax.music_cover_model` 等字段。

## Studio 生成参数（v4.0）

Web Studio 与 API 现已贯通以下控制项：

| 参数 | Playlist | Single | 说明 |
|------|----------|--------|------|
| `waypoints[]` | yes | — | 航点逐步驱动目标 AV |
| `music_params.bpm_range` | yes | via `bpm` | 影响 M3 prompt |
| `music_params.key` | yes | yes | 调性偏好 |
| `music_params.duration_preference` | yes | — | short/medium/long → 60/120/180s |
| `instrumental` | yes | yes | 纯音乐 / 人声 |
| `seed_work_id` | yes | yes | 从作品库选种子 |
| `seed` | job hash | yes | 用户指定可复现 seed |
| `text_intent` | — | yes | 注入 prompt 工程 |
| `moods` / `genres` | 分析 | yes | 来自分析或 Settings |
| `remix_intent` | — | remix | 调用 `remix_prompt()` |
| `cover_mode` | — | cover | one_step / two_step |

配置默认值：`GET /api/v1/config/platform` → `studio` 字段。

## 升级路线图（已实现 v4.0）

- [x] Playlist 航点插值 orchestrator
- [x] Single bpm/key/moods/genres/seed 贯通
- [x] Remix `remix_prompt` 接入
- [x] `/config/platform` Studio defaults
- [x] Job cancel + WebSocket 进度
- [ ] Speech-2.8 TTS 旁白（未来）
