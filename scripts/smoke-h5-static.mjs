#!/usr/bin/env node
/** Verify H5 build artifact exists and contains expected shell markers. */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const indexFile = join(root, "apps", "client", "dist-h5", "index.html");

if (!existsSync(indexFile)) {
  console.error("Missing apps/client/dist-h5/index.html — run npm run build:web first");
  process.exit(1);
}

const html = readFileSync(indexFile, "utf8");
const checks = [
  ["html root", /<html/i.test(html)],
  ["app bundle", /js\/app\.js|app\.js/.test(html)],
  ["title", /炼金|Vibe|Sorcery/i.test(html)],
];

for (const [name, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
  if (!ok) process.exitCode = 1;
}

if (!process.exitCode) console.log("H5 static smoke OK");
