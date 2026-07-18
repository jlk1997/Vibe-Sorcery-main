# Code Review 清单

面向 `apps/client`（Taro H5 / 微信小程序）的评审要点。完整客户端说明见 [UNIFIED_TARO_CLIENT.md](./UNIFIED_TARO_CLIENT.md)。

## Taro 页面文件布局（必查）

Taro 在构建时用 **esbuild** 编译 `*.config.ts`。若在 config 里 re-export 页面或 import SCSS/TSX，会把整页依赖链拉进 esbuild，导致 `No loader is configured for ".scss"` 等构建失败。

### 约定

| 文件 | 职责 |
|------|------|
| `index.config.ts` | **只**导出静态页面配置对象（`navigationBarTitleText`、下拉刷新、分享等） |
| `index.tsx` | 页面组件 + `import "./index.scss"` |

### 禁止

- 在 `*.config.ts` 中 `export { default } from "./index"` 或 `export * from "./index"`
- 在 `*.config.ts` 中 `import "./index.scss"` 或 `import "./index.tsx"`

### 正确示例

```ts
// index.config.ts
export default {
  navigationBarTitleText: "配方市场",
};
```

```tsx
// index.tsx
import "./index.scss";

export default function MarketplacePage() {
  // ...
}
```

### 错误示例

```ts
// index.config.ts — 会导致 build:mp / build:weapp 失败
export { default } from "./index";
```

### 自动化检查

提交前或评审时运行：

```powershell
npm run lint:taro-config
```

脚本：`scripts/lint-taro-page-config.mjs`。
