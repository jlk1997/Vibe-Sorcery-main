import { readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dirname, "..", "apps", "client", "src");
const REPS = [
  [/rgba\(99, 102, 241, 0\.4\)/g, "rgba(147, 130, 180, 0.35)"],
  [/rgba\(99, 102, 241, 0\.35\)/g, "rgba(147, 130, 180, 0.3)"],
  [/rgba\(99, 102, 241, 0\.25\)/g, "rgba(212, 175, 106, 0.2)"],
  [/rgba\(99, 102, 241, 0\.2\)/g, "rgba(147, 130, 180, 0.2)"],
  [/rgba\(99, 102, 241, 0\.15\)/g, "rgba(147, 130, 180, 0.18)"],
  [/rgba\(99, 102, 241, 0\.05\)/g, "rgba(147, 130, 180, 0.08)"],
  [/#a5b4fc/g, "#d4af6a"],
];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (p.endsWith(".scss")) files.push(p);
  }
  return files;
}

let n = 0;
for (const f of walk(ROOT)) {
  let c = readFileSync(f, "utf8");
  const o = c;
  for (const [a, b] of REPS) c = c.replace(a, b);
  if (c !== o) {
    writeFileSync(f, c);
    n++;
  }
}
console.log(`Purged purple from ${n} files`);
