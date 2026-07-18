# Embed Player SDK

在第三方网站嵌入炼金音坊作品播放器。

## 快速开始

将 `WORK_ID` 替换为公开作品的 UUID：

```html
<iframe
  src="https://your-domain/packageOps/pages/embed/index?workId=WORK_ID"
  width="320"
  height="120"
  frameborder="0"
  allow="autoplay"
></iframe>
```

本地 H5 开发：

```
http://localhost:10086/packageOps/pages/embed/index?workId=WORK_ID
```

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/embed/works/{work_id}` | 公开作品元数据（标题、封面、音频 URL） |
| GET | `/embed/branding/{work_id}` | 按作品租户品牌（logo、accent） |
| GET | `/embed/branding/host/{host}` | 按域名白名单品牌（多租户 B2B） |

## 白标品牌

租户管理员可在后台配置：

- `brand` — 显示名称
- `logo_url` — 角标 Logo
- `accent_color` — CSS 变量 `--embed-accent`
- `hide_powered_by` — 隐藏「Powered by」

## 安全

- 仅 `visibility=public` 且已发布到发现页的作品可嵌入
- 音频 URL 为签名短期链接（CDN）
- 不支持在 iframe 内触发付费生成；引流至主站创作

## 与 Open API 配合

B2B 集成典型流程：

1. 用 API Key 调用 `POST /works/generate/single` 生成作品
2. 轮询 `GET /jobs/{id}` 直至 `completed`
3. 将 `work_id` 填入 iframe `src`
4. 可选：注册 Webhook 接收 `completed` 事件自动更新页面

完整 REST 文档见 [OPEN_API.md](./OPEN_API.md) 与 `GET /openapi.json`。
