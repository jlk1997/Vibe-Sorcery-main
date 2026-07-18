#!/usr/bin/env node
/**
 * Scan WeChat mini-program build output and report package sizes.
 * Usage: node scripts/check-mp-size.mjs [--dist path] [--limit-kb 2048]
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
const limitKb = Number(arg("--limit-kb", "2048"));
const limitBytes = limitKb * 1024;

const SUBPACKAGE_ROOTS = [
  "packageStack",
  "packageStudio",
  "packageOps",
  "packageCopilot",
  "packageLegal",
  "packageSocial",
  "packageCommerce",
];

function dirSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) total += dirSize(p);
    else total += fs.statSync(p).size;
  }
  return total;
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function status(bytes) {
  if (bytes > limitBytes) return "FAIL";
  if (bytes > limitBytes * 0.85) return "WARN";
  return "OK";
}

if (!fs.existsSync(distDir)) {
  console.error(`dist not found: ${distDir}`);
  console.error("Run: npm run build:weapp");
  process.exit(1);
}

const rows = [];
let mainBytes = 0;

for (const ent of fs.readdirSync(distDir, { withFileTypes: true })) {
  if (!ent.isDirectory()) continue;
  const name = ent.name;
  if (SUBPACKAGE_ROOTS.includes(name)) continue;
  mainBytes += dirSize(path.join(distDir, name));
}

for (const f of fs.readdirSync(distDir)) {
  const p = path.join(distDir, f);
  if (fs.statSync(p).isFile()) mainBytes += fs.statSync(p).size;
}

rows.push({ name: "main", bytes: mainBytes });

for (const sub of SUBPACKAGE_ROOTS) {
  const p = path.join(distDir, sub);
  rows.push({ name: sub, bytes: fs.existsSync(p) ? dirSize(p) : 0 });
}

const total = rows.reduce((s, r) => s + r.bytes, 0);

console.log(`WeChat mini-program size report (${distDir})`);
console.log(`Limit: ${limitKb} KB per package\n`);
console.log("Package".padEnd(20) + "Size".padStart(12) + "  Status");
console.log("-".repeat(36));

let failed = false;
for (const row of rows) {
  const st = status(row.bytes);
  if (st === "FAIL") failed = true;
  console.log(row.name.padEnd(20) + formatKb(row.bytes).padStart(12) + `  ${st}`);
}

console.log("-".repeat(36));
console.log("total".padEnd(20) + formatKb(total).padStart(12));

if (failed) {
  console.error("\nOne or more packages exceed the size limit.");
  process.exit(1);
}

console.log("\nAll packages within limit.");
