# Unified Taro Client (`apps/client`)

Single codebase for **Web (H5)** and **WeChat mini-program**.

## Dev

```powershell
# Backend
docker compose up -d postgres redis
cd backend; uvicorn app.main:app --reload --port 8000

# Web H5
npm run dev:web

# WeChat mini-program
npm run build:mp   # required once before first DevTools open (dist/ is gitignored)
npm run dev:mp     # watch; auto-builds dist/ on first run if missing
# WeChat DevTools: import apps/client (miniprogramRoot -> dist/)
```

## Build

```powershell
npm run build:web   # -> apps/client/dist-h5/
npm run build:mp    # -> apps/client/dist/
npm run check:mp    # (from apps/client) WXSS + React singleton checks
```

### React singleton (WeChat / monorepo)

Taro mini-program **must ship exactly one React core**. Duplicate copies cause `Cannot read property 'useState' of null` white screen.

- Root [`package.json`](../package.json) **`overrides`** lock `react` / `react-dom` to **18.3.1** (never let workspace hoist React 19).
- [`apps/client/config/index.js`](../apps/client/config/index.js): **H5 only** `react-dom` alias; weapp uses `webpackMiniReactSingleton` (single `react` path alias only — do not override Taro `splitChunks`).
- After `npm run build:mp`, run `npm run check:mp` in `apps/client`.

### Global SCSS / WXSS safety (WeChat)

Main-package styles that ship to `app-origin.wxss` must compile as valid **WXSS**:

- **No universal `*`** selectors (including `*, *::before, *::after` in `@media (prefers-reduced-motion)`).
- **No external `@import url(...)`** — load web fonts via `index.html` `<link>` on H5 only.
- **No H5-only selectors** in shared `app.scss` — use `html` / `body` / `#app` / `.taro-tabbar__*` / `taro-*-core` only in `styles/h5-app-chrome.scss`, loaded when `TARO_ENV === "h5"` in `app.tsx`.
- H5 motion / reset styles: `require("./styles/motion.scss")` and `require("./styles/h5-taro-reset.scss")` behind the same H5 guard.
- **Do not** set `react-dom` webpack alias for weapp in `config/index.js` — Taro maps `react-dom` → `@tarojs/react`; real `react-dom` causes `instanceof HTMLIFrameElement` white screen.

After `npm run build:mp`, run `npm run check:mp` in `apps/client` to catch WXSS and React regressions.

### WeChat DevTools smoke test (after build or style changes)

1. Import project root **`apps/client`** (not `dist/` — `project.config.json` sets `miniprogramRoot: "dist/"`).
2. **详情 → 本地设置**: disable domain check for local API if needed; prefer a **stable** debug base library (e.g. 3.5.x / 3.7.x) over gray 3.16.x to reduce noise.
3. **工具 → 清缓存 → 全部清除**, then **重新编译**.
4. Confirm console has **no** `useState of null`, `instanceof HTMLIFrameElement`, `app-origin.wxss` / `unexpected token '*'`, or React #327 errors.
5. If tab pages stay blank but TabBar works, check **WechatPrivacyGate** — `getPrivacySetting` must not block forever; rebuild after privacy-gate fixes.
5. Tab smoke: **创作 / 发现 / 库 / 我的** each show page content (not blank white).
6. Deep links: open **定价** and a **播放页** from stack subPackage.

### WeChat mini-program API (dev)

WeChat **cannot** use `localhost`, `127.0.0.1`, or relative `/api/v1` — requests fail silently if misconfigured.

1. Find your PC LAN IP (`ipconfig` on Windows).
2. Set `apps/client/.env`: `TARO_APP_API_URL=http://<LAN-IP>:8000/api/v1`
3. Start backend on all interfaces: `npm run dev:api` (`--host 0.0.0.0`).
4. Verify in browser: `http://<LAN-IP>:8000/health` (also aliased at `/api/v1/health`)
5. Rebuild: `npm run build:mp` or `npm run dev:mp` (API URL is baked in at build time).
6. WeChat DevTools → **详情 → 本地设置 → 不校验合法域名**；**工具 → 清缓存 → 全部清除** then recompile.
7. Console should log `[http] API_BASE = http://...` on launch; Network should show `/api/v1/...` calls, not only `SdkReport`.
8. If Console shows `n[e] is not a function` on subpackage pages, ensure `mini.optimizeMainPackage.enable` is **false** and `mini.debugReact` is **true**, then clean rebuild.

### WeChat bottom layout (TabBar / dock / mini player)

H5 uses `document` to set `--tab-bar-stack` and `--mini-player-height`. WeChat has no DOM — use [`LayoutVarsProvider`](../apps/client/src/contexts/LayoutVarsProvider.tsx) on the app root `View` instead.

- **Tab pages on weapp**: `--tab-bar-stack` must be **0** (native TabBar already reserves space).
- **Mini player visible**: `--mini-player-height` = `108rpx`; dock sits above it via shared CSS vars.
- Create / journey floating docks use `--create-dock-reserve` + `--tab-bar-stack` + `--mini-player-height` for scroll padding.

## Page file layout

团队约定（Code Review 必查，详见 [CODE_REVIEW.md](./CODE_REVIEW.md)）：

- `index.config.ts` — 只导出静态配置（`navigationBarTitleText`、下拉刷新、分享等）
- `index.tsx` — 页面组件 + `import "./index.scss"`
- 不要在 config 里 re-export 页面或 import scss/tsx（否则 esbuild 编译 config 时会报 SCSS loader 错误）

```powershell
npm run lint:taro-config
```

## Packages

| Package | Role |
|---------|------|
| `packages/api-client` | Unified REST client (`vibeApi`) |
| `packages/i18n` | Locale + copy |
| `packages/types` | Studio / player types |
| `apps/client/src/platform` | Storage, auth, payment, audio, upload, share |

## Docker

`docker compose up frontend` serves static H5 from `apps/client/dist-h5` via Nginx, proxying `/api` to the backend. Docker build sets `TARO_APP_API_URL=/api/v1` for same-origin API calls.

## Payment redirects

Stripe / Alipay / WeChat H5 pay return to `/pages/settings/index?checkout=success`. Set `FRONTEND_BASE_URL` to your H5 origin (`http://localhost:10086` for dev, `http://localhost:3000` for Docker).

## Client-only policy

The only maintained user client is `apps/client`. Legacy Expo (`mobile/`) and deprecated miniprogram copy (`deploy/miniprogram/`) have been removed. Use `@vibe-sorcery/api-client` from `packages/api-client`.

## Feature parity (2026-07)

- Global `PlayerProvider` + HLS on H5 (feed, works, playlist, challenge, search, user)
- Community: comments, follow, collect, publish from works
- Challenge: `enterChallenge` with work picker
- Studio: mode picker + preset carousel on create
- Journey: AV waypoint map (touch + H5 mouse drag), audio anchor + emotion analyze, AI text plan
- Copilot: `packageCopilot/pages/copilot` — chat via `vibeApi.copilotChat`
- Provenance: remix tree + JSON export (H5)
- Admin + embed: `packageOps` subPackage (stats, reports, feature flags)
- Shell: `PageShell` auto credits badge → pricing
- CI: `build:h5` + `build:weapp` on every PR

## SubPackages (WeChat)

| Root | Pages |
|------|-------|
| `packageStudio` | journey, provenance, feedback |
| `packageOps` | admin, embed, tenant |
| `packageCopilot` | copilot |

发布清单见 [DEPLOY_CHECKLIST.md](./DEPLOY_CHECKLIST.md)。
