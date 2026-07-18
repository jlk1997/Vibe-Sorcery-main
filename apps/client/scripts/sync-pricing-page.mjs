import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcPath = path.resolve(__dirname, "../src/pages/pricing/index.tsx");
const destPath = path.resolve(__dirname, "../src/packageStack/pages/pricing/index.tsx");
const src = fs.readFileSync(srcPath, "utf8");
const out = src.replace(/from "\.\.\/\.\.\//g, 'from "../../../');
fs.writeFileSync(destPath, out);
console.log("Synced", destPath);
