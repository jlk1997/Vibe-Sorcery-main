# Windows 本地启动指南

本文说明如何在 **Windows 10/11** 上启动 Vibe Sorcery 平台 2.0。

## 前置条件

| 软件 | 版本建议 | 用途 |
|------|---------|------|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | 最新 | PostgreSQL、Redis、MinIO |
| [Python](https://www.python.org/downloads/) | 3.11.x | 后端 API + Celery Worker |
| [Node.js](https://nodejs.org/) | 20 LTS | Taro H5 + 微信小程序 |
| Git | 任意 | 克隆仓库 |

可选（完整情绪分析）：
- 下载 Essentia 模型到 `models/` 目录（见原 README）

---

## 方式一：推荐 — 混合启动（Docker 基础设施 + 本地 API/前端）

适合 Windows 日常开发，启动快、便于调试。

### 1. 克隆并配置环境

```powershell
cd E:\Vibe-Sorcery-main\Vibe-Sorcery-main
Copy-Item .env.example .env
notepad .env
```

`.env` 关键配置：

```ini
# 没有 MiniMax Key 时保持 true，可跑通注册/上传/任务/溯源全流程（使用模板 prompt + 模拟音频）
DEV_MOCK_GENERATION=true

# 有 MiniMax Token Plan 时填入 Key，并设为 false
# MINIMAX_API_KEY=你的key
# DEV_MOCK_GENERATION=false
```

### 2. 启动 Docker 基础设施

```powershell
docker compose up -d postgres redis minio
```

等待约 30 秒，确认服务健康：

```powershell
docker compose ps
```

### 3. 创建 Python 虚拟环境并安装依赖

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
```

若 PowerShell 禁止脚本执行，先运行：

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

### 4. 启动后端 API（新终端）

```powershell
cd E:\Vibe-Sorcery-main\Vibe-Sorcery-main
.\.venv\Scripts\Activate.ps1
$env:PYTHONPATH = "$PWD;$PWD\backend"
$env:DATABASE_URL = "postgresql://vibe:vibe@localhost:5432/vibe_sorcery"
$env:CELERY_BROKER_URL = "redis://localhost:6379/1"
$env:CELERY_RESULT_BACKEND = "redis://localhost:6379/2"
$env:S3_ENDPOINT = "http://localhost:9000"
$env:DEV_MOCK_GENERATION = "true"
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API 文档：http://localhost:8000/docs

### 5. 启动 Celery Worker（再开一个终端）

```powershell
cd E:\Vibe-Sorcery-main\Vibe-Sorcery-main
.\.venv\Scripts\Activate.ps1
$env:PYTHONPATH = "$PWD;$PWD\backend"
$env:DATABASE_URL = "postgresql://vibe:vibe@localhost:5432/vibe_sorcery"
$env:CELERY_BROKER_URL = "redis://localhost:6379/1"
$env:CELERY_RESULT_BACKEND = "redis://localhost:6379/2"
$env:S3_ENDPOINT = "http://localhost:9000"
$env:DEV_MOCK_GENERATION = "true"
cd backend
celery -A app.celery_app.celery_app worker --loglevel=info --pool=solo
```

> Windows 上 Celery 需加 `--pool=solo`（不支持默认 prefork）。

### 6. 启动 Web / 小程序（再开一个终端）

```powershell
cd E:\Vibe-Sorcery-main\Vibe-Sorcery-main
npm install
npm run dev:web    # H5 → http://localhost:10086
# 或
npm run dev:mp     # 微信开发者工具导入 apps/client/dist
```

Web H5：http://localhost:10086

### 7. 一键脚本（可选）

```powershell
# 仅启动 Docker 基础设施
.\scripts\start-infra.ps1

# 打印 API / Worker / Frontend 启动命令
.\scripts\start-dev.ps1
```

---

## 方式二：全 Docker 启动

```powershell
Copy-Item .env.example .env
docker compose up -d --build
```

- Web H5: http://localhost:3000 （Docker Nginx 静态托管）
- API: http://localhost:8000/docs
- MinIO Console: http://localhost:9001 （账号/密码: minioadmin）

---

## 使用流程

1. 本地开发：打开 http://localhost:10086/pages/login/index → 注册账号
2. Docker 部署：打开 http://localhost:3000/pages/login/index → 注册账号
2. 进入 **创作** → 上传 `.wav` / `.mp3` 种子音频
3. 点击 **分析情绪** → 配置旅程 → **生成 Playlist**
4. 在 **作品** 页查看生成结果、播放、**查看溯源**
5. 点击 **发布** 后在 **社区** 页可见

---

## ~~移动端 (Expo)~~ — 已暂停

用户端仅维护 `apps/client`（Taro H5 + 微信小程序）。历史 Expo 原生原型已移除。

---

## 启用真实 MiniMax AI 生成

1. 在 [MiniMax Token Plan](https://platform.minimaxi.com/subscribe/token-plan) 获取 API Key
2. 修改 `.env`：

```ini
MINIMAX_API_KEY=你的key
DEV_MOCK_GENERATION=false
```

3. 重启 API 和 Worker

---

## 原版 CLI Pipeline（研究用）

```powershell
pip install -r requirements.txt
# 下载 Essentia 模型到 models/
python main.py -o playlist -n 6 -d 47.0
```

---

## 常见问题

### Docker 启动失败
- 确认 Docker Desktop 已运行且 WSL2 后端正常
- 端口冲突：检查 5432/6379/9000/8000/3000 是否被占用

### Celery 任务不执行
- 确认 Worker 终端在运行且 `--pool=solo`
- 确认 Redis 容器健康：`docker compose ps redis`

### 音频无法播放
- 确认 MinIO 在运行：http://localhost:9001
- 作品 API 会自动刷新 MinIO 预签名 URL

### 情绪分析结果始终是 ambient/electronic
- 未安装 Essentia 模型时会使用默认值；下载模型到 `models/` 后可获得真实 MTG/DEAM 分析

### bcrypt / 注册失败
- 使用 Python 3.11 虚拟环境（推荐），避免 3.14 兼容问题

---

## 方式零：一键启动（Windows）

先启动 Docker 基础设施，再一键拉起 API + Celery + 前端（各开独立 PowerShell 窗口）：

```powershell
.\scripts\start-infra.ps1
.\scripts\start-all.ps1
```

---

## 服务端口一览

| 服务 | 端口 |
|------|------|
| PostgreSQL | 5432 |
| Redis | 6379 |
| MinIO API | 9000 |
| MinIO Console | 9001 |
| FastAPI | 8000 |
| Taro H5（本地 dev） | 10086 |
| Taro H5（Docker） | 3000 |
