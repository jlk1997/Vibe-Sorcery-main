#!/usr/bin/env node
/**
 * Scan WeChat mini-program WXSS output for patterns that break compilation.
 * Usage: node scripts/check-mp-wxss.mjs [--dist path]
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

const FORBIDDEN = [
  { id: "external-import", pattern: /@import\s+url\s*\(/i, hint: "Use index.html <link> on H5; never @import url() in global SCSS" },
  { id: "universal-star", pattern: /\{[^}]*\*[^}]*\}/, hint: "WXSS does not support universal * selectors; keep in H5-only SCSS" },
  { id: "star-comma", pattern: /,\s*\*/, hint: "WXSS does not support *,*::before patterns" },
];

function collectWxssFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) collectWxssFiles(p, out);
    else if (ent.name.endsWith(".wxss")) out.push(p);
  }
  return out;
}

if (!fs.existsSync(distDir)) {
  console.error(`dist not found: ${distDir}`);
  console.error("Run: npm run build:weapp");
  process.exit(1);
}

const files = collectWxssFiles(distDir);
let failed = false;

console.log(`WXSS safety check (${distDir})`);
console.log(`Files scanned: ${files.length}\n`);

for (const file of files) {
  const rel = path.relative(distDir, file);
  const content = fs.readFileSync(file, "utf8");
  for (const rule of FORBIDDEN) {
    if (rule.pattern.test(content)) {
      failed = true;
      console.error(`FAIL [${rule.id}] ${rel}`);
      console.error(`  ${rule.hint}`);
    }
  }
}

if (failed) {
  console.error("\nWXSS contains WeChat-incompatible patterns.");
  process.exit(1);
}

console.log("All WXSS files passed WeChat compatibility checks.");
