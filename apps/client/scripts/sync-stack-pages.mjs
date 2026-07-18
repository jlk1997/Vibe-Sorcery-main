import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagesRoot = path.resolve(__dirname, "../src/pages");
const stackRoot = path.resolve(__dirname, "../src/packageStack/pages");

const SKIP = new Set(["create", "feed", "library", "profile"]);

for (const ent of fs.readdirSync(pagesRoot, { withFileTypes: true })) {
  if (!ent.isDirectory() || SKIP.has(ent.name)) continue;
  const srcTsx = path.join(pagesRoot, ent.name, "index.tsx");
  const destTsx = path.join(stackRoot, ent.name, "index.tsx");
  if (!fs.existsSync(srcTsx) || !fs.existsSync(path.dirname(destTsx))) continue;
  const src = fs.readFileSync(srcTsx, "utf8");
  const out = src
    .replace(/from "\.\.\/\.\.\//g, 'from "../../../')
    .replace(/import\("\.\.\/\.\.\//g, 'import("../../../')
    .replace(/import\('\.\.\/\.\.\//g, "import('../../../");
  fs.writeFileSync(destTsx, out);
  console.log("sync tsx", ent.name);

  const srcScss = path.join(pagesRoot, ent.name, "index.scss");
  const destScss = path.join(stackRoot, ent.name, "index.scss");
  if (fs.existsSync(srcScss) && fs.existsSync(path.dirname(destScss))) {
    const scss = fs.readFileSync(srcScss, "utf8");
    const scssOut = scss
      .replace(/@import "\.\.\/\.\.\/styles\//g, '@import "../../../styles/')
      .replace(/@import "\.\.\/\.\.\/styles\/_utilities\.scss"/g, '@import "../../../styles/_utilities.scss"');
    fs.writeFileSync(destScss, scssOut);
    console.log("sync scss", ent.name);
  }
}
