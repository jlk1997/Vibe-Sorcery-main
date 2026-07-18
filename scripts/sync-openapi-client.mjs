#!/usr/bin/env node
/**
 * Fetches OpenAPI schema from a running API and writes packages/api-client/generated/openapi.json.
 * Use in CI after starting the API, or locally: npm run sync:openapi
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const baseUrl = process.argv[2] || process.env.API_PUBLIC_URL || "http://localhost:8000/api/v1";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "packages", "api-client", "generated");
const outFile = join(outDir, "openapi.json");
const pathsManifest = join(outDir, "paths.txt");

async function main() {
  const openapiRoot = baseUrl.replace(/\/api\/v1\/?$/, "");
  const res = await fetch(`${openapiRoot}/openapi.json`);
  if (!res.ok) {
    console.error(`Failed to fetch OpenAPI: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const schema = await res.json();
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, JSON.stringify(schema, null, 2));
  const paths = Object.keys(schema.paths || {}).sort();
  writeFileSync(pathsManifest, paths.join("\n") + "\n");
  console.log(`OpenAPI synced: ${paths.length} paths -> ${outFile}`);

  if (process.argv.includes("--check")) {
    const prev = existsSync(pathsManifest) ? readFileSync(pathsManifest, "utf8") : "";
    const next = paths.join("\n") + "\n";
    if (prev && prev !== next) {
      console.error("OpenAPI path list changed — update packages/api-client/src/client.ts");
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
