#!/usr/bin/env node
/**
 * Design token lint — flags banned colors, spacing magic numbers, and undefined CSS vars.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = join(import.meta.dirname, "..", "apps", "client", "src");
const THEME_PATH = join(ROOT, "styles", "theme.scss");
const BANNED_COLORS = [/#6366f1/i, /#7c3aed/i, /#8b5cf6/i];
const SPACING_PROP = /^\s*(gap|margin(?:-(?:top|bottom|left|right))?|padding(?:-(?:top|bottom|left|right))?)\s*:/;
const MAGIC_SPACING = /\b(12|20)rpx\b/;
const EXCLUDE = ["node_modules", "dist"];
const VAR_USAGE = /var\(\s*(--[a-zA-Z0-9-]+)/g;

let errors = 0;
let warnings = 0;

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (EXCLUDE.some((e) => p.includes(e))) continue;
    if (statSync(p).isDirectory()) walk(p, files);
    else if (p.endsWith(".scss")) files.push(p);
  }
  return files;
}

function loadAllowedCssVars() {
  const theme = readFileSync(THEME_PATH, "utf8");
  const allowed = new Set();
  const re = /^\s*(--[a-zA-Z0-9-]+)\s*:/gm;
  let m;
  while ((m = re.exec(theme)) !== null) {
    allowed.add(m[1]);
  }
  return allowed;
}

const allowedVars = loadAllowedCssVars();

for (const file of walk(ROOT)) {
  const rel = relative(join(import.meta.dirname, ".."), file);
  const content = readFileSync(file, "utf8");
  const lines = content.split("\n");

  lines.forEach((line, i) => {
    if (line.trim().startsWith("//")) return;
    for (const re of BANNED_COLORS) {
      if (re.test(line)) {
        console.error(`${rel}:${i + 1} banned color: ${line.trim()}`);
        errors++;
      }
    }
    if (!rel.includes("tokens/") && !rel.includes("theme.scss") && SPACING_PROP.test(line) && MAGIC_SPACING.test(line)) {
      console.error(`${rel}:${i + 1} magic spacing: ${line.trim()}`);
      errors++;
    }
    if (rel.includes("theme.scss")) return;
    let vm;
    VAR_USAGE.lastIndex = 0;
    while ((vm = VAR_USAGE.exec(line)) !== null) {
      const name = vm[1];
      if (!allowedVars.has(name)) {
        console.error(`${rel}:${i + 1} undefined CSS var: ${name}`);
        errors++;
      }
    }
  });
}

if (warnings > 0) {
  console.warn(`\n${warnings} design token warning(s).`);
}
if (errors > 0) {
  console.error(`\n${errors} design token violation(s) found.`);
  process.exit(1);
}
console.log("Design token lint passed.");
