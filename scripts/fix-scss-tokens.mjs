import { readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dirname, "..", "apps", "client", "src");

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (p.endsWith(".scss")) files.push(p);
  }
  return files;
}

const reps = [
  [/gap: -2xs/g, "gap: $space-2xs"],
  [/gap: -xs/g, "gap: $space-xs"],
  [/padding: -2xs -sm/g, "padding: $space-2xs $space-sm"],
  [/padding: -2xs -xs/g, "padding: $space-2xs $space-xs"],
  [/padding: -xs -sm/g, "padding: $space-xs $space-sm"],
  [/padding: -xs -xs/g, "padding: $space-xs $space-xs"],
  [/padding: -xs -2xs/g, "padding: $space-xs $space-2xs"],
  [/padding: -2xs 0/g, "padding: $space-2xs 0"],
  [/padding: -xs 0/g, "padding: $space-xs 0"],
  [/margin-top: -2xs/g, "margin-top: $space-2xs"],
  [/margin-bottom: -2xs/g, "margin-bottom: $space-2xs"],
  [/margin: -2xs 0/g, "margin: $space-2xs 0"],
  [/margin: -2xs 0 \$space-md/g, "margin: $space-2xs 0 $space-md"],
  [/margin: 0 -2xs -2xs 0/g, "margin: 0 $space-2xs $space-2xs 0"],
];

let fixed = 0;
for (const file of walk(ROOT)) {
  let content = readFileSync(file, "utf8");
  const orig = content;
  for (const [from, to] of reps) content = content.replace(from, to);
  if (content !== orig) {
    writeFileSync(file, content);
    fixed++;
  }
}
console.log(`Fixed ${fixed} files`);
