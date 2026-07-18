#!/usr/bin/env node
/**
 * Taro page config lint — *.config.ts must export a static config object,
 * not re-export the page component (which pulls SCSS into esbuild).
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = join(import.meta.dirname, "..", "apps", "client", "src");
const FORBIDDEN = [
  /export\s+\{\s*default\s*\}\s+from\s+["']\.\//,
  /export\s+\*\s+from\s+["']\.\//,
  /import\s+["']\.\/index\.scss["']/,
  /import\s+["']\.\/index\.(tsx|ts|jsx|js)["']/,
];

let errors = 0;

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (name.endsWith(".config.ts") || name.endsWith(".config.js")) files.push(p);
  }
  return files;
}

for (const file of walk(ROOT)) {
  const rel = relative(join(import.meta.dirname, ".."), file).replace(/\\/g, "/");
  const src = readFileSync(file, "utf8");
  for (const rule of FORBIDDEN) {
    if (rule.test(src)) {
      console.error(`[lint:taro-config] ${rel}: page config must be a static object, not a re-export of ./index`);
      errors++;
      break;
    }
  }
}

if (errors > 0) {
  console.error(`\nlint:taro-config failed with ${errors} error(s).`);
  process.exit(1);
}

console.log("lint:taro-config: OK");
