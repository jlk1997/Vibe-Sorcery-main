#!/usr/bin/env node
/**
 * Detect duplicate React cores in WeChat mini-program main chunks.
 * Usage: node scripts/check-mp-react.mjs [--dist path]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const distDir = path.resolve(clientRoot, arg("--dist", "dist"));
const REACT_CORE =
  /function\(\w+,\w+\)\{"use strict";var \w+=Symbol\.for\("react\.element"\),\w+=Symbol\.for\("react\.portal"\)/g;
const MAIN_CHUNKS = ["vendors.js", "taro.js", "common.js", "app.js"];

if (!fs.existsSync(distDir)) {
  console.error(`dist not found: ${distDir}`);
  console.error("Run: npm run build:mp");
  process.exit(1);
}

let totalHits = 0;
let failed = false;

console.log(`React singleton check (${distDir})\n`);

for (const name of MAIN_CHUNKS) {
  const file = path.join(distDir, name);
  if (!fs.existsSync(file)) continue;
  const content = fs.readFileSync(file, "utf8");
  const hits = (content.match(REACT_CORE) || []).length;
  if (hits > 0) {
    console.log(`  ${name}: ${hits} React core(s)`);
    totalHits += hits;
  }
  if (/version:"19\./.test(content) || /React version 19/.test(content)) {
    failed = true;
    console.error(`FAIL [react-19] ${name} contains React 19 markers`);
  }
}

if (totalHits === 0) {
  failed = true;
  console.error("FAIL: no React core found in main chunks (build may be broken)");
} else if (totalHits > 1) {
  failed = true;
  console.error(`\nFAIL: ${totalHits} React cores in main chunks (expected 1)`);
  console.error("Fix: root package.json overrides + webpackMiniReactSingleton in config/index.js");
}

if (failed) {
  process.exit(1);
}

console.log("\nSingle React core confirmed in mini-program main bundle.");
