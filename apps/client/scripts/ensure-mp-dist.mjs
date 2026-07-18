#!/usr/bin/env node
/**
 * Ensure WeChat mini-program build output exists before DevTools import.
 * Usage: node scripts/ensure-mp-dist.mjs [--build]
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(__dirname, "..");
const appJson = path.join(clientRoot, "dist", "app.json");
const shouldBuild = process.argv.includes("--build");

if (fs.existsSync(appJson)) {
  process.exit(0);
}

console.error("\n[weapp] dist/app.json not found.");
console.error("WeChat DevTools needs a build in apps/client/dist/ (dist/ is gitignored).\n");

if (shouldBuild) {
  console.error("[weapp] Running one-time build: taro build --type weapp …\n");
  const result = spawnSync("npx", ["taro", "build", "--type", "weapp"], {
    cwd: clientRoot,
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0 || !fs.existsSync(appJson)) {
    process.exit(result.status || 1);
  }
  console.error("\n[weapp] dist/app.json ready. Import apps/client in WeChat DevTools.\n");
  process.exit(0);
}

console.error("Fix:");
console.error("  npm run build:mp     # from repo root");
console.error("  npm run dev:mp       # watch mode (wait for first compile, then refresh DevTools)");
console.error("\nImport directory: apps/client (project.config.json sets miniprogramRoot to dist/)\n");
process.exit(1);
